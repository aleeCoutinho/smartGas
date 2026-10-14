(function () {
  "use strict";

  var base = (window.SAFE_GAS_CONFIG && window.SAFE_GAS_CONFIG.API_BASE_URL) || "http://localhost:3000";
  window.SafeGasAuth = {
    apiBaseUrl: base.replace(/\/$/, ""),
    token: function () { return localStorage.getItem("smartgas_token"); },
    save: function (payload) {
      localStorage.setItem("smartgas_token", payload.token);
      localStorage.setItem("smartgas_session", JSON.stringify(payload.user));
    },
    clear: function () {
      localStorage.removeItem("smartgas_token");
      localStorage.removeItem("smartgas_session");
    },
    request: async function (path, options) {
      var opts = options || {};
      var headers = Object.assign({}, opts.headers || {});
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";
      var token = this.token();
      if (token) headers.Authorization = "Bearer " + token;
      var response = await fetch(this.apiBaseUrl + path, Object.assign({}, opts, { headers: headers }));
      var contentType = response.headers.get("content-type") || "";
      var payload = contentType.indexOf("application/json") >= 0 ? await response.json() : null;
      if (!response.ok) throw new Error((payload && payload.message) || "Não foi possível concluir a operação.");
      return payload;
    }
  };
})();
