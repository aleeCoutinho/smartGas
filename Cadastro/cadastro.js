const signupForm = document.querySelector("#signup-form");

if (signupForm) {
    signupForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const nameInput = document.querySelector("#nome");
        const emailInput = document.querySelector("#email");
        const passwordInput = document.querySelector("#senha");
        const confirmPasswordInput = document.querySelector("#confirmar-senha");

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (password !== confirmPassword) {
            alert("As senhas não coincidem!");
            confirmPasswordInput.focus();
            return;
        }

        const validPassword = /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{8,32}$/.test(password);

        if (!validPassword) {
            alert("A senha deve ter de 8 a 32 caracteres, com pelo menos uma letra e um número, sem espaços ou símbolos.");
            passwordInput.focus();
            return;
        }

        window.SafeGasAuth.request("/api/auth/signup", {
            method: "POST",
            body: JSON.stringify({ name: name, email: email, password: password })
        }).then(function (payload) {
            window.SafeGasAuth.save(payload);
            if (!payload.user.canAccessPanel) {
                alert("Conta criada, mas este usuário não tem acesso ao painel.");
                return;
            }
            alert("Conta criada com sucesso!");
            window.location.href = "../software/index.html";
        }).catch(function (error) {
            alert(error.message);
        });
    });
}
