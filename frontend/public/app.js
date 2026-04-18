(() => {
  function inferDefaultApiBase() {
    return `${window.location.origin}/api`;
  }

  function resolveStoredApiBase(stored) {
    if (!stored) return inferDefaultApiBase();
    try {
      const u = new URL(stored);
      if (u.origin !== window.location.origin) {
        return inferDefaultApiBase();
      }
      if (
        u.port === "4000" &&
        u.hostname === window.location.hostname &&
        window.location.port !== "4000"
      ) {
        return inferDefaultApiBase();
      }
    } catch (_err) {
      return inferDefaultApiBase();
    }
    return stored;
  }

  function persistApiBaseIfNeeded(resolved) {
    const prev = sessionStorage.getItem("apiBase");
    if (prev !== resolved) {
      sessionStorage.setItem("apiBase", resolved);
    }
  }

  function resolveApiBaseForRequest() {
    let base = (state.apiBase || "").replace(/\/$/, "") || inferDefaultApiBase();
    try {
      const u = new URL(base);
      if (u.origin !== window.location.origin) {
        base = inferDefaultApiBase().replace(/\/$/, "");
        state.apiBase = base;
        sessionStorage.setItem("apiBase", base);
        if (el.apiBase) el.apiBase.value = base;
      }
    } catch (_err) {
      base = inferDefaultApiBase().replace(/\/$/, "");
      state.apiBase = base;
      sessionStorage.setItem("apiBase", base);
      if (el.apiBase) el.apiBase.value = base;
    }
    return base;
  }

  /**
   * Origen del documento del callback OAuth (mismo host que redirect_uri en Azure).
   * El popup abre en la API (p.ej. sqlbackmails...), no en el panel (hubmails...).
   */
  function microsoftOAuthCallbackOrigin() {
    const ru = state.microsoftConfig?.redirectUri;
    if (ru) {
      try {
        return new URL(ru).origin;
      } catch (_err) {
        return null;
      }
    }
    try {
      const u = new URL(state.apiBase);
      return u.origin;
    } catch (_err) {
      return window.location.origin;
    }
  }

  function isAllowedMicrosoftOAuthMessage(event) {
    const callbackOrigin = microsoftOAuthCallbackOrigin();
    if (callbackOrigin && event.origin === callbackOrigin) {
      return true;
    }
    // Mismo host que el panel (callback bajo mismo origen que /api)
    if (event.origin === window.location.origin) {
      return true;
    }
    return false;
  }

  /**
   * Abre ventana auxiliar en el mismo tick del clic (requisito del navegador).
   * Nombre unico: si se reutiliza el mismo nombre, Chrome suele convertirlo en pestaña.
   * Cadena de features sin espacios: si hay tokens desconocidos, algunos navegadores ignoran todo el string.
   */
  function openMicrosoftOAuthShell() {
    const w = 560;
    const h = 720;
    const sw = window.screen?.availWidth || window.screen?.width || 1280;
    const sh = window.screen?.availHeight || window.screen?.height || 800;
    const ox = window.screen?.availLeft ?? 0;
    const oy = window.screen?.availTop ?? 0;
    const left = Math.max(0, Math.round(ox + (sw - w) / 2));
    const top = Math.max(0, Math.round(oy + (sh - h) / 2));
    const features = `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`;
    const name = `hub_ms_oauth_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    return window.open("about:blank", name, features);
  }

  function defaultMicrosoftRedirectUri() {
    return `${window.location.protocol}//${window.location.hostname}:4000/auth/microsoft/callback`;
  }

  const initialApiBase = resolveStoredApiBase(sessionStorage.getItem("apiBase"));
  persistApiBaseIfNeeded(initialApiBase);

  const state = {
    token: sessionStorage.getItem("token") || "",
    user: null,
    apiBase: initialApiBase,
    oauthTokensByAccount: JSON.parse(sessionStorage.getItem("oauthTokensByAccount") || "{}"),
    microsoftConfig: null,
    companies: [],
    accounts: [],
    users: [],
    runs: [],
    runsPage: 1,
    runsMeta: { total: 0, totalPages: 1, limit: 4 },
    /** ids de job_runs con el bloque Detalle expandido (persiste al refrescar la lista por polling) */
    runsDetailExpandedIds: new Set(),
    selectedUserCompanyId: null,
    selectedAccountIds: new Set(),
    queueRunning: false
  };

  const el = {
    loginSection: document.getElementById("loginSection"),
    appSection: document.getElementById("appSection"),
    loginForm: document.getElementById("loginForm"),
    accountForm: document.getElementById("accountForm"),
    logoutBtn: document.getElementById("logoutBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    refreshRunsBtn: document.getElementById("refreshRunsBtn"),
    refreshUsersBtn: document.getElementById("refreshUsersBtn"),
    refreshOauthBtn: document.getElementById("refreshOauthBtn"),
    message: document.getElementById("message"),
    sessionInfo: document.getElementById("sessionInfo"),
    accountsList: document.getElementById("accountsList"),
    accountsCount: document.getElementById("accountsCount"),
    apiBase: document.getElementById("apiBase"),
    usersSection: document.getElementById("usersSection"),
    oauthSection: document.getElementById("oauthSection"),
    userForm: document.getElementById("userForm"),
    oauthForm: document.getElementById("oauthForm"),
    msValidateBtn: document.getElementById("msValidateBtn"),
    usersList: document.getElementById("usersList"),
    usersCount: document.getElementById("usersCount"),
    runsList: document.getElementById("runsList"),
    runsPagination: document.getElementById("runsPagination"),
    runsListHint: document.getElementById("runsListHint"),
    accountSelectAllBtn: document.getElementById("accountSelectAllBtn"),
    accountSelectNoneBtn: document.getElementById("accountSelectNoneBtn"),
    accountQueueDryBtn: document.getElementById("accountQueueDryBtn"),
    accountQueueMigrateBtn: document.getElementById("accountQueueMigrateBtn"),
    companiesSection: document.getElementById("companiesSection"),
    companiesList: document.getElementById("companiesList"),
    companiesCount: document.getElementById("companiesCount"),
    refreshCompaniesBtn: document.getElementById("refreshCompaniesBtn"),
    companyForm: document.getElementById("companyForm"),
    companySubmitBtn: document.getElementById("companySubmitBtn"),
    userCompanySelectorWrap: document.getElementById("userCompanySelectorWrap"),
    userCompanySelect: document.getElementById("userCompanySelect")
  };

  function normalize(value, max = 255) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
  }

  function setMessage(message, isError = false, opts = {}) {
    el.message.textContent = message || "";
    el.message.style.color = isError ? "#fca5a5" : "#fcd34d";
    if (message && el.message && opts.scrollToMessage) {
      requestAnimationFrame(() => {
        el.message.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }

  function setAuth(token, user) {
    state.token = token;
    state.user = user;
    sessionStorage.setItem("token", token);
  }

  function clearAuth() {
    state.token = "";
    state.user = null;
    sessionStorage.removeItem("token");
    state.oauthTokensByAccount = {};
    sessionStorage.removeItem("oauthTokensByAccount");
  }

  function saveOauthToken(accountId, token) {
    if (!accountId || !token) return;
    state.oauthTokensByAccount[accountId] = token;
    sessionStorage.setItem("oauthTokensByAccount", JSON.stringify(state.oauthTokensByAccount));
  }

  async function api(path, options = {}) {
    const base = resolveApiBaseForRequest();
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    let response;
    try {
      response = await fetch(url, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch (err) {
      const msg = err && err.message ? err.message : "Error de red";
      throw new Error(
        `${msg} al llamar ${url}. Si acabas de actualizar, vacia cache del sitio o borra sessionStorage (apiBase) y recarga.`
      );
    }

    if (response.status === 204) return null;

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Error HTTP ${response.status}`);
    }
    return data;
  }

  function renderSession() {
    if (!state.user) {
      el.sessionInfo.textContent = "";
      return;
    }
    el.sessionInfo.textContent = JSON.stringify(state.user, null, 2);
  }

  function createTextLine(label, value) {
    const p = document.createElement("p");
    p.textContent = `${label}: ${value || "-"}`;
    return p;
  }

  function renderAccounts() {
    el.accountsList.replaceChildren();
    el.accountsCount.textContent = `Total cuentas: ${state.accounts.length} · Seleccionadas para cola: ${state.selectedAccountIds.size}`;
    for (const item of state.accounts) {
      const card = document.createElement("article");
      card.className = "item";

      const selWrap = document.createElement("div");
      selWrap.className = "row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = `sel-acc-${item.id}`;
      cb.checked = state.selectedAccountIds.has(item.id);
      cb.disabled = state.queueRunning;
      cb.addEventListener("change", () => {
        if (cb.checked) state.selectedAccountIds.add(item.id);
        else state.selectedAccountIds.delete(item.id);
        el.accountsCount.textContent = `Total cuentas: ${state.accounts.length} · Seleccionadas para cola: ${state.selectedAccountIds.size}`;
      });
      const lab = document.createElement("label");
      lab.htmlFor = cb.id;
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(" Incluir en cola secuencial"));
      selWrap.appendChild(lab);
      card.appendChild(selWrap);

      const title = document.createElement("h3");
      title.textContent = `${item.provider} - ${item.sourceEmail}`;
      card.appendChild(title);

      card.appendChild(createTextLine("Destino", item.destinationEmail));
      card.appendChild(createTextLine("Host origen", item.sourceHost));
      card.appendChild(createTextLine("Host destino", item.destinationHost));
      card.appendChild(createTextLine("Activa", String(item.isActive)));
      card.appendChild(createTextLine("Clave destino guardada", item.hasDestinationSecret ? "si" : "no"));
      if (item.provider === "microsoft") {
        card.appendChild(createTextLine("OAuth Microsoft", item.hasMicrosoftOauth ? "conectado" : "pendiente"));
      }

      const actions = document.createElement("div");
      actions.className = "row";

      if (item.provider === "microsoft") {
        const connectBtn = document.createElement("button");
        connectBtn.className = "secondary";
        connectBtn.textContent = state.oauthTokensByAccount[item.id] ? "Actualizar OAuth2" : "Conectar OAuth2";
        connectBtn.addEventListener("click", () => {
          const popup = openMicrosoftOAuthShell();
          if (!popup || popup.closed) {
            setMessage(
              "No se pudo abrir la ventana OAuth2. En Chrome: icono de candado > Ventanas emergentes > Permitir. En Safari: Ajustes > Sitios web > Ventanas emergentes.",
              true
            );
            return;
          }
          void (async () => {
            try {
              await loadMicrosoftConfig();
              if (!state.microsoftConfig?.redirectUri) {
                popup.close();
                setMessage(
                  "Falta Redirect URI en Configuracion Microsoft; guarda la configuracion y usa Comprobar.",
                  true
                );
                return;
              }
              const result = await api("/auth/microsoft/connect-url", {
                method: "POST",
                body: { mailAccountId: item.id, frontendOrigin: window.location.origin }
              });
              popup.location.href = result.authorizeUrl;
              setMessage(
                "Completa el login en la ventana o pestaña que se abrio. Si fue pestaña, es normal en algunos navegadores; al terminar, vuelve aqui y deberia actualizarse el estado."
              );
              void waitForMicrosoftOAuthConnection(item.id).then((ok) => {
                if (!ok) {
                  setMessage(
                    "OAuth aun no aparece conectado. Pulsa 'Actualizar' en Cuentas registradas o repite Conectar OAuth2.",
                    true
                  );
                }
              });
            } catch (err) {
              try {
                popup.close();
              } catch (_e2) {
                // ignore
              }
              setMessage(err.message, true);
            }
          })();
        });
        actions.appendChild(connectBtn);
      }

      const testBtn = document.createElement("button");
      testBtn.className = "secondary";
      testBtn.textContent = "Probar login";
      if (item.provider === "microsoft" && !item.hasMicrosoftOauth) {
        testBtn.disabled = true;
        testBtn.title = "Conecta OAuth2 para habilitar esta accion";
      }
      testBtn.addEventListener("click", async () => {
        try {
          await runMigration(item, true);
        } catch (err) {
          setMessage(err.message || "No se pudo lanzar la prueba de login.", true);
        }
      });
      actions.appendChild(testBtn);

      const migrateBtn = document.createElement("button");
      migrateBtn.textContent = "Migrar ahora";
      if (item.provider === "microsoft" && !item.hasMicrosoftOauth) {
        migrateBtn.disabled = true;
        migrateBtn.title = "Conecta OAuth2 para habilitar esta accion";
      }
      migrateBtn.addEventListener("click", async () => {
        try {
          await runMigration(item, false);
        } catch (err) {
          setMessage(err.message || "No se pudo lanzar la migracion.", true);
        }
      });
      actions.appendChild(migrateBtn);

      const saveDestPasswordBtn = document.createElement("button");
      saveDestPasswordBtn.className = "secondary";
      saveDestPasswordBtn.textContent = "Guardar clave destino";
      saveDestPasswordBtn.addEventListener("click", async () => {
        const destinationPassword = normalize(window.prompt("Contraseña IMAP destino"), 256);
        if (!destinationPassword) {
          setMessage("La contraseña de destino es requerida.", true);
          return;
        }
        try {
          await api(`/mail-accounts/${item.id}/destination-secret`, {
            method: "POST",
            body: { destinationPassword }
          });
          setMessage("Contraseña de destino guardada.");
          await loadAccounts();
        } catch (err) {
          setMessage(err.message, true);
        }
      });
      actions.appendChild(saveDestPasswordBtn);

      const disableBtn = document.createElement("button");
      disableBtn.className = "secondary";
      disableBtn.textContent = "Desactivar";
      disableBtn.disabled = !item.isActive;
      disableBtn.addEventListener("click", async () => {
        try {
          await api(`/mail-accounts/${item.id}`, { method: "DELETE" });
          setMessage("Cuenta desactivada");
          await loadAccounts();
        } catch (err) {
          setMessage(err.message, true);
        }
      });
      actions.appendChild(disableBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "danger";
      deleteBtn.textContent = "Eliminar";
      deleteBtn.addEventListener("click", async () => {
        const confirmDelete = window.confirm(
          `Eliminar definitivamente la cuenta ${item.sourceEmail}? Esta accion no se puede deshacer.`
        );
        if (!confirmDelete) return;
        try {
          await api(`/mail-accounts/${item.id}/permanent`, { method: "DELETE" });
          delete state.oauthTokensByAccount[item.id];
          sessionStorage.setItem("oauthTokensByAccount", JSON.stringify(state.oauthTokensByAccount));
          setMessage("Cuenta eliminada.");
          await loadAccounts();
        } catch (err) {
          setMessage(err.message, true);
        }
      });
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      el.accountsList.appendChild(card);
    }
  }

  function renderRunsPagination() {
    if (!el.runsPagination) return;
    el.runsPagination.replaceChildren();
    const { total, totalPages, limit } = state.runsMeta;
    const page = state.runsPage;
    if (total === 0) {
      el.runsPagination.classList.add("hidden");
      return;
    }
    el.runsPagination.classList.remove("hidden");
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "secondary";
    prev.textContent = "Anterior";
    prev.disabled = page <= 1;
    prev.addEventListener("click", async () => {
      if (state.runsPage <= 1) return;
      state.runsPage -= 1;
      try {
        await loadRuns();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
    const label = document.createElement("span");
    label.className = "hint";
    label.textContent = `Pagina ${page} de ${totalPages} (${total} total, ${limit} por pagina)`;
    const next = document.createElement("button");
    next.type = "button";
    next.className = "secondary";
    next.textContent = "Siguiente";
    next.disabled = page >= totalPages;
    next.addEventListener("click", async () => {
      if (state.runsPage >= totalPages) return;
      state.runsPage += 1;
      try {
        await loadRuns();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
    el.runsPagination.appendChild(prev);
    el.runsPagination.appendChild(label);
    el.runsPagination.appendChild(next);
  }

  function renderRuns() {
    el.runsList.replaceChildren();
    if (el.runsListHint) {
      el.runsListHint.classList.toggle("hidden", state.runsMeta.total === 0);
      el.runsListHint.textContent =
        state.runsMeta.total > 0
          ? `Mostrando hasta ${state.runsMeta.limit} ejecuciones por pagina. Usa Ver más para el log completo de cada una.`
          : "";
    }
    if (!state.runs.length) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent =
        state.runsMeta.total === 0 ? "Sin ejecuciones registradas." : "Sin resultados en esta pagina.";
      el.runsList.appendChild(p);
      renderRunsPagination();
      return;
    }
    for (const run of state.runs) {
      const card = document.createElement("article");
      card.className = "item";
      const title = document.createElement("h3");
      title.textContent = `${run.jobName || "Job"} - ${run.status}`;
      card.appendChild(title);
      card.appendChild(createTextLine("Inicio", run.startedAt));
      card.appendChild(createTextLine("Fin", run.finishedAt));
      card.appendChild(createTextLine("Resumen", run.summary));
      const detailText = run.errorDetail != null && run.errorDetail !== "" ? String(run.errorDetail) : "";
      if (detailText) {
        const wrap = document.createElement("div");
        wrap.className = "run-detail-block";
        const detLabel = document.createElement("p");
        detLabel.className = "hint";
        detLabel.style.margin = "0";
        detLabel.textContent = "Detalle";
        const pre = document.createElement("pre");
        pre.className = "pre run-detail-pre";
        pre.textContent = detailText;
        const expanded = run.id && state.runsDetailExpandedIds.has(run.id);
        pre.hidden = !expanded;
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "secondary run-detail-toggle";
        toggle.textContent = expanded ? "Ver menos" : "Ver más";
        toggle.addEventListener("click", () => {
          const willShow = pre.hidden;
          pre.hidden = !willShow;
          if (run.id) {
            if (willShow) state.runsDetailExpandedIds.add(run.id);
            else state.runsDetailExpandedIds.delete(run.id);
          }
          toggle.textContent = willShow ? "Ver menos" : "Ver más";
        });
        wrap.appendChild(detLabel);
        wrap.appendChild(toggle);
        wrap.appendChild(pre);
        card.appendChild(wrap);
      }
      el.runsList.appendChild(card);
    }
    renderRunsPagination();
  }

  function renderUsers() {
    if (!el.usersList) return;
    el.usersList.replaceChildren();
    el.usersCount.textContent = `Total usuarios: ${state.users.length}`;
    for (const user of state.users) {
      const card = document.createElement("article");
      card.className = "item";

      const title = document.createElement("h3");
      title.textContent = `${user.fullName} (${user.email})`;
      card.appendChild(title);
      card.appendChild(createTextLine("Rol", user.role));
      card.appendChild(createTextLine("Activo", String(user.isActive)));

      const roleSelect = document.createElement("select");
      ["company_admin", "operator", "scheduler", "viewer"].forEach((role) => {
        const op = document.createElement("option");
        op.value = role;
        op.textContent = role;
        if (user.role === role) op.selected = true;
        roleSelect.appendChild(op);
      });

      const saveBtn = document.createElement("button");
      saveBtn.className = "secondary";
      saveBtn.textContent = "Cambiar rol";
      saveBtn.addEventListener("click", async () => {
        try {
          const body = { role: normalize(roleSelect.value, 30) };
          if (state.user?.role === "superadmin" && state.selectedUserCompanyId) {
            body.companyId = state.selectedUserCompanyId;
          }
          await api(`/users/${user.id}/role`, {
            method: "PATCH",
            body
          });
          setMessage("Rol actualizado.");
          await loadUsers();
        } catch (err) {
          setMessage(err.message, true);
        }
      });

      const actions = document.createElement("div");
      actions.className = "row";
      actions.appendChild(roleSelect);
      actions.appendChild(saveBtn);
      card.appendChild(actions);

      el.usersList.appendChild(card);
    }
  }

  async function loadAccounts() {
    const result = await api("/mail-accounts");
    state.accounts = Array.isArray(result?.items) ? result.items : [];
    renderAccounts();
  }

  async function loadUsers() {
    if (!state.user || !["superadmin", "company_admin"].includes(state.user.role)) return;
    let path = "/users";
    if (state.user.role === "superadmin" && state.selectedUserCompanyId) {
      path = `/users?companyId=${encodeURIComponent(state.selectedUserCompanyId)}`;
    }
    const result = await api(path);
    state.users = Array.isArray(result?.items) ? result.items : [];
    renderUsers();
  }

  async function loadRuns() {
    const result = await api(`/jobs/runs?page=${encodeURIComponent(String(state.runsPage))}&limit=4`);
    state.runs = Array.isArray(result?.items) ? result.items : [];
    const visibleRunIds = new Set(state.runs.map((r) => r.id).filter(Boolean));
    for (const id of [...state.runsDetailExpandedIds]) {
      if (!visibleRunIds.has(id)) state.runsDetailExpandedIds.delete(id);
    }
    const total = Number(result?.total) || 0;
    const limit = Number(result?.limit) || 4;
    const totalPages = Math.max(1, Number(result?.totalPages) || 1);
    const page = Number(result?.page) || state.runsPage;
    state.runsPage = page;
    state.runsMeta = { total, totalPages, limit };
    renderRuns();
  }

  function fillMicrosoftConfigForm(config) {
    if (!el.oauthForm) return;
    document.getElementById("msClientId").value = config?.clientId || "";
    document.getElementById("msClientSecret").value = "";
    document.getElementById("msTenantId").value = config?.tenantId || "common";
    document.getElementById("msRedirectUri").value = config?.redirectUri || defaultMicrosoftRedirectUri();
    document.getElementById("msFrontendOrigin").value = config?.frontendOrigin || window.location.origin;
    document.getElementById("msIsActive").value = config?.isActive === false ? "false" : "true";
  }

  async function loadCompanies() {
    if (state.user?.role !== "superadmin") return;
    const result = await api("/companies");
    state.companies = Array.isArray(result?.items) ? result.items : [];
    renderCompanies();
  }

  function renderCompanies() {
    if (!el.companiesList || !el.companiesCount) return;
    el.companiesList.replaceChildren();
    el.companiesCount.textContent = `Total empresas: ${state.companies.length}`;
    for (const c of state.companies) {
      const card = document.createElement("article");
      card.className = "item";
      const title = document.createElement("h3");
      title.textContent = c.name;
      card.appendChild(title);
      card.appendChild(createTextLine("Slug (login)", c.slug));
      card.appendChild(createTextLine("Activa", String(c.isActive)));
      card.appendChild(createTextLine("Id", c.id));
      el.companiesList.appendChild(card);
    }
    if (el.userCompanySelect) {
      const prev = state.selectedUserCompanyId;
      el.userCompanySelect.replaceChildren();
      for (const c of state.companies) {
        const op = document.createElement("option");
        op.value = c.id;
        op.textContent = `${c.name} (${c.slug})`;
        if (prev ? prev === c.id : state.user?.companyId === c.id) {
          op.selected = true;
        }
        el.userCompanySelect.appendChild(op);
      }
      state.selectedUserCompanyId = el.userCompanySelect.value || null;
    }
  }

  async function loadMicrosoftConfig() {
    if (!state.user || !["superadmin", "company_admin"].includes(state.user.role)) return;
    const result = await api("/oauth-configs/microsoft");
    state.microsoftConfig = result?.item || null;
    if (el.oauthForm) {
      fillMicrosoftConfigForm(state.microsoftConfig);
    }
  }

  function setQueueControlsDisabled(disabled) {
    [el.accountSelectAllBtn, el.accountSelectNoneBtn, el.accountQueueDryBtn, el.accountQueueMigrateBtn].forEach((btn) => {
      if (btn) btn.disabled = disabled;
    });
  }

  async function waitForRunComplete(runId, dryRun) {
    const maxWaitMs = dryRun ? 25 * 60 * 1000 : 8 * 60 * 60 * 1000;
    const deadline = Date.now() + maxWaitMs;
    let seen = false;
    while (Date.now() < deadline) {
      try {
        const data = await api(`/jobs/runs/${encodeURIComponent(runId)}`);
        const row = data?.item;
        if (row) {
          seen = true;
          if (row.status !== "running") {
            await loadRuns().catch(() => {});
            return row;
          }
        }
      } catch (_err) {
        // Transitorio (404 justo al crear, red, etc.): reintentar.
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    await loadRuns().catch(() => {});
    throw new Error(
      seen
        ? "Tiempo maximo esperando el fin de la ejecucion. Revisa Ejecuciones recientes."
        : "No aparecio la ejecucion en el listado. Revisa backend y vuelve a intentar."
    );
  }

  async function runMigrationQueue(dryRun) {
    const ids = Array.from(state.selectedAccountIds);
    if (!ids.length) {
      setMessage("Selecciona al menos una cuenta (casilla En cola).", true);
      return;
    }
    const accounts = ids
      .map((id) => state.accounts.find((a) => a.id === id))
      .filter(Boolean);
    for (const a of accounts) {
      if (a.provider === "microsoft" && !a.hasMicrosoftOauth) {
        setMessage(`La cuenta ${a.sourceEmail} no tiene OAuth Microsoft. Conectala antes de usar la cola.`, true);
        return;
      }
    }
    state.queueRunning = true;
    setQueueControlsDisabled(true);
    renderAccounts();
    try {
      for (let i = 0; i < accounts.length; i += 1) {
        const a = accounts[i];
        setMessage(`Cola ${i + 1}/${accounts.length}: ${a.sourceEmail} (${dryRun ? "probar login" : "migrar"})…`);
        const launched = await runMigration(a, dryRun);
        if (!launched) {
          setMessage(`Cola detenida: no se pudo iniciar ${a.sourceEmail}.`, true);
          return;
        }
        const finished = await waitForRunComplete(launched.runId, dryRun);
        if (finished.status === "failed") {
          setMessage(`Fallo en ${a.sourceEmail}. Cola detenida. Revisa el detalle en Ejecuciones recientes.`, true);
          return;
        }
      }
      setMessage(`Cola terminada: ${accounts.length} cuenta(s).`);
      await loadRuns();
    } catch (err) {
      setMessage(err.message || "Error en la cola de migracion.", true);
    } finally {
      state.queueRunning = false;
      setQueueControlsDisabled(false);
      renderAccounts();
    }
  }

  async function waitForMicrosoftOAuthConnection(accountId, timeoutMs = 120000, intervalMs = 2000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const result = await api("/mail-accounts");
        const items = Array.isArray(result?.items) ? result.items : [];
        state.accounts = items;
        const current = items.find((it) => it.id === accountId);
        renderAccounts();
        if (current?.hasMicrosoftOauth) {
          setMessage("Cuenta Microsoft conectada correctamente.");
          return true;
        }
      } catch (_err) {
        // Ignora fallas transitorias de red durante la espera.
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
  }

  async function runMigration(account, dryRun) {
    const isMicrosoft = account.provider === "microsoft";
    if (isMicrosoft && !account.hasMicrosoftOauth) {
      setMessage("Esta cuenta Microsoft no esta conectada por OAuth2. Pulsa primero 'Conectar OAuth2'.", true);
      return null;
    }
    const storedToken = isMicrosoft ? normalize(state.oauthTokensByAccount[account.id] || "", 10000) : "";
    const sourceToken = isMicrosoft ? storedToken : "";
    const sourcePassword = !isMicrosoft ? normalize(window.prompt("Contraseña IMAP origen"), 256) : "";
    const destinationPassword = account.hasDestinationSecret
      ? ""
      : normalize(window.prompt("Contraseña IMAP destino"), 256);

    if (!account.hasDestinationSecret && !destinationPassword) {
      setMessage("La contraseña de destino es requerida.", true);
      return null;
    }
    if (!isMicrosoft && !sourcePassword) {
      setMessage("La contraseña de origen es requerida.", true);
      return null;
    }

    try {
      const data = await api("/jobs/run", {
        method: "POST",
        body: {
          mailAccountId: account.id,
          sourceToken: sourceToken || null,
          sourcePassword: sourcePassword || null,
          destinationPassword,
          dryRun
        }
      });
      setMessage(dryRun ? "Prueba de login lanzada." : "Migración lanzada.");
      await loadRuns();
      return data?.runId ? { runId: data.runId } : null;
    } catch (err) {
      setMessage(err.message || "No se pudo crear la ejecucion.", true);
      throw err;
    }
  }

  async function bootstrapSession() {
    if (!state.token) {
      el.loginSection.classList.remove("hidden");
      el.appSection.classList.add("hidden");
      return;
    }

    try {
      const result = await api("/auth/me");
      state.user = result.user;
      el.loginSection.classList.add("hidden");
      el.appSection.classList.remove("hidden");
      el.usersSection.classList.toggle(
        "hidden",
        !["superadmin", "company_admin"].includes(state.user.role)
      );
      if (el.oauthSection) {
        el.oauthSection.classList.toggle("hidden", !["superadmin", "company_admin"].includes(state.user.role));
      }
      if (el.companiesSection) {
        el.companiesSection.classList.toggle("hidden", state.user.role !== "superadmin");
      }
      if (el.userCompanySelectorWrap) {
        el.userCompanySelectorWrap.classList.toggle("hidden", state.user.role !== "superadmin");
      }
      renderSession();
      await loadAccounts();
      await loadUsers();
      await loadMicrosoftConfig();
      if (state.user.role === "superadmin") {
        await loadCompanies();
        await loadUsers();
      }
      await loadRuns();
    } catch (_err) {
      clearAuth();
      el.loginSection.classList.remove("hidden");
      el.appSection.classList.add("hidden");
      setMessage("Sesión expirada. Inicia sesión de nuevo.", true);
    }
  }

  el.apiBase.value = state.apiBase;

  el.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");

    const body = {
      email: normalize(document.getElementById("email").value, 190).toLowerCase(),
      password: normalize(document.getElementById("password").value, 256),
      companySlug: normalize(document.getElementById("companySlug").value, 120).toLowerCase()
    };
    const rawApi = normalize(el.apiBase.value, 200);
    state.apiBase = rawApi || inferDefaultApiBase();
    sessionStorage.setItem("apiBase", state.apiBase);

    try {
      const result = await api("/auth/login", { method: "POST", body });
      setAuth(result.token, result.user);
      renderSession();
      el.loginSection.classList.add("hidden");
      el.appSection.classList.remove("hidden");
      el.usersSection.classList.toggle(
        "hidden",
        !["superadmin", "company_admin"].includes(result.user.role)
      );
      if (el.oauthSection) {
        el.oauthSection.classList.toggle("hidden", !["superadmin", "company_admin"].includes(result.user.role));
      }
      if (el.companiesSection) {
        el.companiesSection.classList.toggle("hidden", result.user.role !== "superadmin");
      }
      if (el.userCompanySelectorWrap) {
        el.userCompanySelectorWrap.classList.toggle("hidden", result.user.role !== "superadmin");
      }
      await loadAccounts();
      await loadUsers();
      await loadMicrosoftConfig();
      if (result.user.role === "superadmin") {
        await loadCompanies();
        await loadUsers();
      }
      await loadRuns();
      setMessage("Sesión iniciada correctamente.");
    } catch (err) {
      setMessage(err.message, true);
    }
  });

  el.accountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");

    const body = {
      provider: normalize(document.getElementById("provider").value, 20).toLowerCase(),
      sourceEmail: normalize(document.getElementById("sourceEmail").value, 190).toLowerCase(),
      destinationEmail: normalize(document.getElementById("destinationEmail").value, 190).toLowerCase() || null,
      sourceHost: normalize(document.getElementById("sourceHost").value, 190).toLowerCase() || null,
      destinationHost: normalize(document.getElementById("destinationHost").value, 190).toLowerCase() || null
    };

    try {
      await api("/mail-accounts", { method: "POST", body });
      setMessage("Cuenta guardada.");
      el.accountForm.reset();
      await loadAccounts();
    } catch (err) {
      setMessage(err.message, true);
    }
  });

  el.refreshBtn.addEventListener("click", async () => {
    try {
      await loadAccounts();
      setMessage("Lista actualizada.");
    } catch (err) {
      setMessage(err.message, true);
    }
  });

  if (el.accountSelectAllBtn) {
    el.accountSelectAllBtn.addEventListener("click", () => {
      if (state.queueRunning) return;
      state.accounts.forEach((a) => state.selectedAccountIds.add(a.id));
      renderAccounts();
      setMessage(`${state.selectedAccountIds.size} cuenta(s) seleccionadas para cola.`);
    });
  }

  if (el.accountSelectNoneBtn) {
    el.accountSelectNoneBtn.addEventListener("click", () => {
      if (state.queueRunning) return;
      state.selectedAccountIds.clear();
      renderAccounts();
      setMessage("Seleccion de cola vaciada.");
    });
  }

  if (el.accountQueueDryBtn) {
    el.accountQueueDryBtn.addEventListener("click", () => {
      void runMigrationQueue(true);
    });
  }

  if (el.accountQueueMigrateBtn) {
    el.accountQueueMigrateBtn.addEventListener("click", () => {
      void runMigrationQueue(false);
    });
  }

  if (el.refreshRunsBtn) {
    el.refreshRunsBtn.addEventListener("click", async () => {
      try {
        await loadRuns();
        setMessage("Ejecuciones actualizadas.");
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  }

  if (el.refreshUsersBtn) {
    el.refreshUsersBtn.addEventListener("click", async () => {
      try {
        await loadUsers();
        setMessage("Usuarios actualizados.");
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  }

  if (el.refreshOauthBtn) {
    el.refreshOauthBtn.addEventListener("click", async () => {
      try {
        await loadMicrosoftConfig();
        setMessage("Configuracion Microsoft actualizada.");
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  }

  if (el.refreshCompaniesBtn) {
    el.refreshCompaniesBtn.addEventListener("click", async () => {
      try {
        await loadCompanies();
        setMessage("Lista de empresas actualizada.");
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  }

  if (el.companyForm) {
    el.companyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("");
      const name = normalize(document.getElementById("coName").value, 160);
      const slugRaw = normalize(document.getElementById("coSlug").value, 120)
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (!name || !slugRaw) {
        setMessage("Nombre y slug son obligatorios. El slug: solo minusculas, numeros y guiones.", true, {
          scrollToMessage: true
        });
        return;
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugRaw)) {
        setMessage(
          "Slug invalido: usa solo letras minusculas, numeros y guiones (ej: ad-publicidad, visualad). Sin espacios ni guiones al inicio o al final.",
          true,
          { scrollToMessage: true }
        );
        return;
      }
      const body = { name, slug: slugRaw };
      const submitBtn = el.companySubmitBtn;
      const prevLabel = submitBtn ? submitBtn.textContent : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Creando…";
      }
      try {
        await api("/companies", { method: "POST", body });
        setMessage(
          "Empresa creada. Las demas empresas y sus datos no se modifican. El superadmin actual ya tiene acceso a la nueva.",
          false,
          { scrollToMessage: true }
        );
        el.companyForm.reset();
        await loadCompanies();
      } catch (err) {
        setMessage(err.message, true, { scrollToMessage: true });
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = prevLabel || "Crear empresa";
        }
      }
    });
  }

  if (el.userForm) {
    el.userForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("");
      const body = {
        email: normalize(document.getElementById("userEmail").value, 190).toLowerCase(),
        fullName: normalize(document.getElementById("userFullName").value, 160),
        role: normalize(document.getElementById("userRole").value, 30)
      };
      const maybePassword = normalize(document.getElementById("userPassword").value, 256);
      if (maybePassword) body.password = maybePassword;
      if (state.user?.role === "superadmin" && state.selectedUserCompanyId) {
        body.companyId = state.selectedUserCompanyId;
      }
      try {
        await api("/users", { method: "POST", body });
        setMessage("Usuario creado/actualizado.");
        el.userForm.reset();
        await loadUsers();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  }

  if (el.userCompanySelect) {
    el.userCompanySelect.addEventListener("change", async () => {
      state.selectedUserCompanyId = el.userCompanySelect.value || null;
      try {
        await loadUsers();
        setMessage("Usuarios actualizados para la empresa seleccionada.");
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  }

  if (el.msValidateBtn) {
    el.msValidateBtn.addEventListener("click", async () => {
      setMessage("Comprobando configuracion Microsoft…");
      try {
        const r = await api("/oauth-configs/microsoft/check");
        if (r.hint) {
          setMessage(r.hint, true);
          return;
        }
        const c = r.checks || {};
        const lines = [
          `Comprobacion Microsoft: ${r.ok ? "OK" : "revisar campos"}`,
          `clientId=${c.clientIdPresent ? "ok" : "falta"}`,
          `tenantMetadata=${c.microsoftTenantMetadata ? "ok" : "fallo"}${
            c.microsoftTenantMetadataDetail ? `(${c.microsoftTenantMetadataDetail})` : ""
          }`,
          `redirectHttps=${c.redirectUriHttps ? "ok" : "no"}`,
          `callbackPath=${c.redirectUriCallbackPath ? "ok" : "no"}`,
          `frontendHttps=${c.frontendOriginHttps ? "ok" : "no"}`,
          `activo=${c.configActive ? "si" : "no"}`
        ];
        if (r.azure?.redirectUriMustMatchExactly) {
          lines.push(`redirectUri BD: ${r.azure.redirectUriMustMatchExactly}`);
        }
        if (r.azure?.note) lines.push(r.azure.note);
        setMessage(lines.join(" | "), !r.ok);
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  }

  if (el.oauthForm) {
    el.oauthForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("");
      const body = {
        clientId: normalize(document.getElementById("msClientId").value, 190),
        clientSecret: normalize(document.getElementById("msClientSecret").value, 2000),
        tenantId: normalize(document.getElementById("msTenantId").value, 190) || "common",
        redirectUri: normalize(document.getElementById("msRedirectUri").value, 300),
        frontendOrigin: normalize(document.getElementById("msFrontendOrigin").value, 300),
        isActive: document.getElementById("msIsActive").value === "true"
      };
      try {
        await api("/oauth-configs/microsoft", { method: "PUT", body });
        setMessage("Configuracion Microsoft guardada para esta empresa.");
        await loadMicrosoftConfig();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  }

  window.addEventListener("message", (event) => {
    if (!isAllowedMicrosoftOAuthMessage(event)) return;
    const data = event.data || {};
    if (data.type === "microsoft-oauth-success" && data.accountId && data.accessToken) {
      saveOauthToken(data.accountId, normalize(data.accessToken, 10000));
      setMessage("Cuenta Microsoft conectada. Token OAuth2 listo para migracion.");
      loadAccounts().catch(() => {
        renderAccounts();
      });
      return;
    }
    if (data.type === "microsoft-oauth-error") {
      setMessage(data.message || "No se pudo completar OAuth2 de Microsoft.", true);
    }
  });

  el.logoutBtn.addEventListener("click", () => {
    clearAuth();
    el.appSection.classList.add("hidden");
    el.loginSection.classList.remove("hidden");
    renderSession();
    el.accountsList.replaceChildren();
    if (el.usersList) el.usersList.replaceChildren();
    if (el.runsList) el.runsList.replaceChildren();
    state.runsPage = 1;
    state.runsMeta = { total: 0, totalPages: 1, limit: 4 };
    state.runsDetailExpandedIds.clear();
    if (el.runsPagination) {
      el.runsPagination.replaceChildren();
      el.runsPagination.classList.add("hidden");
    }
    if (el.runsListHint) {
      el.runsListHint.textContent = "";
      el.runsListHint.classList.add("hidden");
    }
    if (el.oauthSection) el.oauthSection.classList.add("hidden");
    if (el.companiesSection) el.companiesSection.classList.add("hidden");
    if (el.userCompanySelectorWrap) el.userCompanySelectorWrap.classList.add("hidden");
    setMessage("Sesión cerrada.");
  });

  bootstrapSession();
})();
