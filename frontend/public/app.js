(() => {
  const state = {
    token: sessionStorage.getItem("token") || "",
    user: null,
    apiBase: sessionStorage.getItem("apiBase") || `${window.location.protocol}//${window.location.hostname}:4000`,
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
    message: document.getElementById("message"),
    sessionInfo: document.getElementById("sessionInfo"),
    accountsList: document.getElementById("accountsList"),
    accountsCount: document.getElementById("accountsCount"),
    apiBase: document.getElementById("apiBase"),
    usersSection: document.getElementById("usersSection"),
    userForm: document.getElementById("userForm"),
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
  }

  async function api(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    const response = await fetch(`${state.apiBase}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

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

      const actions = document.createElement("div");
      actions.className = "row";

      const testBtn = document.createElement("button");
      testBtn.className = "secondary";
      testBtn.textContent = "Probar login";
      testBtn.addEventListener("click", async () => {
        await runMigration(item, true);
      });
      actions.appendChild(testBtn);

      const migrateBtn = document.createElement("button");
      migrateBtn.textContent = "Migrar ahora";
      migrateBtn.addEventListener("click", async () => {
        await runMigration(item, false);
      });
      actions.appendChild(migrateBtn);

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

  async function runMigration(account, dryRun) {
    const isMicrosoft = account.provider === "microsoft";
    const sourceToken = isMicrosoft ? normalize(window.prompt("Pega token OAuth2 de origen"), 10000) : "";
    const sourcePassword = !isMicrosoft ? normalize(window.prompt("Contraseña IMAP origen"), 256) : "";
    const destinationPassword = normalize(window.prompt("Contraseña IMAP destino"), 256);

    if (!destinationPassword) {
      setMessage("La contraseña de destino es requerida.", true);
      return;
    }
    if (isMicrosoft && !sourceToken) {
      setMessage("El token OAuth2 es requerido para Microsoft.", true);
      return;
    }
    if (!isMicrosoft && !sourcePassword) {
      setMessage("La contraseña de origen es requerida.", true);
      return;
    }

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
      renderSession();
      await loadAccounts();
      await loadUsers();
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
    state.apiBase = normalize(el.apiBase.value, 200);
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
      await loadAccounts();
      await loadUsers();
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

  el.logoutBtn.addEventListener("click", () => {
    clearAuth();
    el.appSection.classList.add("hidden");
    el.loginSection.classList.remove("hidden");
    renderSession();
    el.accountsList.replaceChildren();
    if (el.usersList) el.usersList.replaceChildren();
    if (el.runsList) el.runsList.replaceChildren();
    setMessage("Sesión cerrada.");
  });

  bootstrapSession();
})();
