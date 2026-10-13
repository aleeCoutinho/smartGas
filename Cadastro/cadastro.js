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

        let users = JSON.parse(localStorage.getItem("smartgas_users")) || [];

        const userExists = users.some(u => u.email === email);
        if (userExists) {
            alert("Este e-mail já está cadastrado!");
            return;
        }

        const newUser = {
            id: Date.now().toString(),
            name: name,
            email: email,
            password: password 
        };

        users.push(newUser);
        localStorage.setItem("smartgas_users", JSON.stringify(users));

        const sessionData = { id: newUser.id, name: newUser.name, email: newUser.email };
        localStorage.setItem("smartgas_session", JSON.stringify(sessionData));

        alert("Conta criada com sucesso!");
        window.location.href = "../Login/login.html";
    });
}