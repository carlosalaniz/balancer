import { postData } from "./utils.js";
$("#login-btn").click(async (e) => {
    e.preventDefault();
    const email = $("#email").val();
    const password = $("#password").val();
    try {
        await postData("do-login", {
            email, password
        });
        let params = (new URL(document.location)).searchParams;
        let redirect = params.get("redirect");
        window.location.href = window.location.origin + (redirect !== null ? redirect : window.location.href.split("/").slice(3,-1).join(''));
    } catch (err) {
        console.error(err);
    }
})