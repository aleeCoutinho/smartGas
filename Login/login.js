const loginForm = document.querySelector("#login-form");

if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const email = document.querySelector("#email").value.trim();
        const password = document.querySelector("#senha").value;

        let users = JSON.parse(localStorage.getItem("smartgas_users")) || [];
        const user = users.find(u => u.email === email && u.password === password);

        if (!user) {
            alert("E-mail ou senha incorretos. Você já se cadastrou?");
            return;
        }

        const sessionData = {
            id: user.id,
            name: user.name,
            email: user.email
        };
        
        localStorage.setItem("smartgas_session", JSON.stringify(sessionData));

        alert("Login realizado com sucesso!");
        window.location.href = "../index.html";
    });
}