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

  function expectedOAuthPopupOrigin() {
    try {
      const u = new URL(state.apiBase);
      const path = u.pathname.replace(/\/$/, "") || "/";
      if (path === "/api" || path.endsWith("/api")) {
        return `${u.protocol}//${u.hostname}:4000`;
      }
      return u.origin;
    } catch (_err) {
      return `${window.location.protocol}//${window.location.hostname}:4000`;
    }
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
    accounts: [],
    users: [],
    runs: []
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
    usersList: document.getElementById("usersList"),
    usersCount: document.getElementById("usersCount"),
    runsList: document.getElementById("runsList")
  };

  function normalize(value, max = 255) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
  }

  function setMessage(message, isError = false) {
    el.message.textContent = message || "";
    el.message.style.color = isError ? "#fca5a5" : "#fcd34d";
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
    el.accountsCount.textContent = `Total cuentas: ${state.accounts.length}`;
    for (const item of state.accounts) {
      const card = document.createElement("article");
      card.className = "item";

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
        connectBtn.addEventListener("click", async () => {
          try {
            const result = await api("/auth/microsoft/connect-url", {
              method: "POST",
              body: { mailAccountId: item.id, frontendOrigin: window.location.origin }
            });
            const popup = window.open(
              result.authorizeUrl,
              "microsoft-oauth",
              "popup=yes,width=560,height=720"
            );
            if (!popup) {
              setMessage("Tu navegador bloqueó la ventana OAuth2. Habilita popups e intenta de nuevo.", true);
              return;
            }
            setMessage("Sigue el login en la ventana emergente de Microsoft.");
          } catch (err) {
            setMessage(err.message, true);
          }
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

  function renderRuns() {
    el.runsList.replaceChildren();
    if (!state.runs.length) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Sin ejecuciones registradas.";
      el.runsList.appendChild(p);
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
      if (run.errorDetail) {
        card.appendChild(createTextLine("Detalle", String(run.errorDetail).slice(0, 260)));
      }
      el.runsList.appendChild(card);
    }
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
          await api(`/users/${user.id}/role`, {
            method: "PATCH",
            body: { role: normalize(roleSelect.value, 30) }
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
    const result = await api("/users");
    state.users = Array.isArray(result?.items) ? result.items : [];
    renderUsers();
  }

  async function loadRuns() {
    const result = await api("/jobs/runs");
    state.runs = Array.isArray(result?.items) ? result.items : [];
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

  async function loadMicrosoftConfig() {
    if (!state.user || !["superadmin", "company_admin"].includes(state.user.role) || !el.oauthForm) return;
    const result = await api("/oauth-configs/microsoft");
    state.microsoftConfig = result?.item || null;
    fillMicrosoftConfigForm(state.microsoftConfig);
  }

  async function runMigration(account, dryRun) {
    const isMicrosoft = account.provider === "microsoft";
    if (isMicrosoft && !account.hasMicrosoftOauth) {
      setMessage("Esta cuenta Microsoft no esta conectada por OAuth2. Pulsa primero 'Conectar OAuth2'.", true);
      return;
    }
    const storedToken = isMicrosoft ? normalize(state.oauthTokensByAccount[account.id] || "", 10000) : "";
    const sourceToken = isMicrosoft ? storedToken : "";
    const sourcePassword = !isMicrosoft ? normalize(window.prompt("Contraseña IMAP origen"), 256) : "";
    const destinationPassword = account.hasDestinationSecret
      ? ""
      : normalize(window.prompt("Contraseña IMAP destino"), 256);

    if (!account.hasDestinationSecret && !destinationPassword) {
      setMessage("La contraseña de destino es requerida.", true);
      return;
    }
    if (!isMicrosoft && !sourcePassword) {
      setMessage("La contraseña de origen es requerida.", true);
      return;
    }

    try {
      await api("/jobs/run", {
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
      renderSession();
      await loadAccounts();
      await loadUsers();
      await loadMicrosoftConfig();
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
      await loadAccounts();
      await loadUsers();
      await loadMicrosoftConfig();
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

  if (el.userForm) {
    el.userForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("");
      const body = {
        email: normalize(document.getElementById("userEmail").value, 190).toLowerCase(),
        fullName: normalize(document.getElementById("userFullName").value, 160),
        password: normalize(document.getElementById("userPassword").value, 256),
        role: normalize(document.getElementById("userRole").value, 30)
      };
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
    const allowedOrigin = expectedOAuthPopupOrigin();
    if (!allowedOrigin || event.origin !== allowedOrigin) return;
    const data = event.data || {};
    if (data.type === "microsoft-oauth-success" && data.accountId && data.accessToken) {
      saveOauthToken(data.accountId, normalize(data.accessToken, 10000));
      setMessage("Cuenta Microsoft conectada. Token OAuth2 listo para migracion.");
      renderAccounts();
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
    if (el.oauthSection) el.oauthSection.classList.add("hidden");
    setMessage("Sesión cerrada.");
  });

  bootstrapSession();
  setInterval(async () => {
    if (!state.token || el.appSection.classList.contains("hidden")) return;
    try {
      await loadRuns();
    } catch (_err) {
      // Silencioso para no interrumpir la operacion del usuario.
    }
  }, 6000);
})();
