(() => {
  const state = {
    token: sessionStorage.getItem("token") || "",
    user: null,
    apiBase: sessionStorage.getItem("apiBase") || `${window.location.protocol}//${window.location.hostname}:4000`,
    accounts: []
  };

  const el = {
    loginSection: document.getElementById("loginSection"),
    appSection: document.getElementById("appSection"),
    loginForm: document.getElementById("loginForm"),
    accountForm: document.getElementById("accountForm"),
    logoutBtn: document.getElementById("logoutBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    message: document.getElementById("message"),
    sessionInfo: document.getElementById("sessionInfo"),
    accountsList: document.getElementById("accountsList"),
    accountsCount: document.getElementById("accountsCount"),
    apiBase: document.getElementById("apiBase")
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

  async function loadAccounts() {
    const result = await api("/mail-accounts");
    state.accounts = Array.isArray(result?.items) ? result.items : [];
    renderAccounts();
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
      renderSession();
      await loadAccounts();
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
      await loadAccounts();
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

  el.logoutBtn.addEventListener("click", () => {
    clearAuth();
    el.appSection.classList.add("hidden");
    el.loginSection.classList.remove("hidden");
    renderSession();
    el.accountsList.replaceChildren();
    setMessage("Sesión cerrada.");
  });

  bootstrapSession();
})();
