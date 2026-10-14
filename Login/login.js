const loginForm = document.querySelector("#login-form");

if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const email = document.querySelector("#email").value.trim();
        const password = document.querySelector("#senha").value;

        window.SafeGasAuth.request("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: email, password: password })
        }).then(function (payload) {
            window.SafeGasAuth.save(payload);
            if (!payload.user.canAccessPanel) {
                alert("Login realizado, mas este usuário não tem acesso ao painel.");
                return;
            }
            alert("Login realizado com sucesso!");
            window.location.href = "../software/index.html";
        }).catch(function (error) {
            alert(error.message);
        });
    });
}
