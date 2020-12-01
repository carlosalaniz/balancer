import { postData } from "./utils.js";
$("#register-form").submit(async (e) => {
    e.preventDefault();
    const data = $("#register-form").serializeArray().reduce((reducer, current) => {
        reducer[current.name] = current.value;
        return reducer;
    }, {});
    try {
        let result = await postData("/do-register", data);
        window.localStorage.jwt = result;
        window.location.href = "/transactions";
    } catch (e) {
        console.error(e);
    }
})