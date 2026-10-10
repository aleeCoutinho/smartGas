const loginForm = document.querySelector("#login-form");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.querySelector("#email").value;
    const password = document.querySelector("#senha").value;

    try {
        const response = await fetch("", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ user: { email, password } })
        });

        const data = await response.json();

        if (!response.ok || data.message) {
            alert(data.message || "E-mail ou senha incorretos.");
            return;
        }

        const { id, name } = data;
        sessionStorage.setItem("user", JSON.stringify({ id, name, email }));

        window.location.href = "login-sucesso.html";

    } catch (error) {
        console.error("Erro no login:", error);
        alert("Erro de conexão com o servidor. Tente novamente.");
    }
});