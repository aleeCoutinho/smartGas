
const form = document.querySelector("#signup-form");

const nameInput = document.querySelector("#nome");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#senha");
const confirmPasswordInput = document.querySelector("#confirmar-senha");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (password !== confirmPassword) {
        alert("As senhas não coincidem!");
        confirmPasswordInput.focus();
        return;
    }

    const validPassword =
        /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{8,32}$/.test(password);

    if (!validPassword) {
        alert(
            "A senha deve ter de 8 a 32 caracteres, " +
            "com pelo menos uma letra e um número, sem espaços ou símbolos."
        );
        passwordInput.focus();
        return;
    }

    const user = {
        name,
        email,
        password
    };

    try {
        const response = await fetch("", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ user })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || "Não foi possível criar sua conta.");
            return;
        }

        alert(data.message || "Conta criada com sucesso!");

        window.location.href = "./login.html";

    } catch (error) {
        console.error("Erro ao cadastrar usuário:", error);
        alert("Não foi possível conectar ao servidor. Tente novamente.");
    }
});
