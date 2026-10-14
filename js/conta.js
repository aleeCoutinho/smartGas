(function () {
  "use strict";

  var openBtn = document.getElementById("account-btn");
  var modal = document.getElementById("account-modal");
  if (!openBtn || !modal || typeof modal.showModal !== "function") return;

  var loggedInPanel = document.getElementById("modal-logged-in");
  var loggedOutPanel = document.getElementById("modal-logged-out");
  var userNameEl = document.getElementById("account-user-name");
  var userEmailEl = document.getElementById("account-user-email");
  var logoutBtn = document.getElementById("btn-logout");

  function updateAccountView() {
    var session = localStorage.getItem("smartgas_session");
    var user = null;
    try { user = session ? JSON.parse(session) : null; } catch (err) { user = null; }
    var authOnlyElements = document.querySelectorAll("[data-auth-only]");
    for (var i = 0; i < authOnlyElements.length; i++) {
      authOnlyElements[i].style.display = user && user.canAccessPanel ? "inline-flex" : "none";
    }

    if (user) {
      try {
        if (userNameEl) userNameEl.textContent = "Bem-vindo, " + (user.name || "Usuário");
        if (userEmailEl) userEmailEl.textContent = user.email || "";

        if (loggedInPanel) loggedInPanel.style.display = "block";
        if (loggedOutPanel) loggedOutPanel.style.display = "none";
      } catch (err) {
        if (loggedInPanel) loggedInPanel.style.display = "none";
        if (loggedOutPanel) loggedOutPanel.style.display = "block";
      }
    } else {
      if (loggedInPanel) loggedInPanel.style.display = "none";
      if (loggedOutPanel) loggedOutPanel.style.display = "block";
    }
  }

  updateAccountView();

  openBtn.addEventListener("click", function () {
    updateAccountView();
    modal.showModal();
  });

  modal.addEventListener("click", function (event) {
    if (event.target === modal || event.target.closest("[data-close-modal]")) {
      modal.close();
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      if (window.SafeGasAuth) window.SafeGasAuth.clear();
      else localStorage.removeItem("smartgas_token");
      localStorage.removeItem("smartgas_session");
      updateAccountView();
      modal.close();
    });
  }

  var options = modal.querySelectorAll("[data-theme-option]");
  var theme = window.SmartGasTheme;
  if (!theme) return;

  function sync() {
    var current = theme.current();
    for (var i = 0; i < options.length; i++) {
      options[i].setAttribute(
        "aria-pressed",
        String(options[i].dataset.themeOption === current)
      );
    }
  }

  for (var i = 0; i < options.length; i++) {
    options[i].addEventListener("click", function () {
      theme.apply(this.dataset.themeOption);
      sync();
    });
  }

  sync();
})();
