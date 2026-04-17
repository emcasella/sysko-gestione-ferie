sap.ui.define(["sap/ui/core/mvc/Controller"], function (Controller) {
  "use strict";

  /* Escape HTML to prevent XSS when interpolating user data into innerHTML */
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  return Controller.extend("sysko.ferie.employee.controller.App", {

    onInit: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      // Route names must match sap.ui5.routing.routes[*].name in manifest.json
      oRouter.attachRouteMatched(this._onRouteMatched, this);
    },

    onAfterRendering: function () {
      this._injectSidebar();
    },

    onExit: function () {
      this.getOwnerComponent().getRouter()
        .detachRouteMatched(this._onRouteMatched, this);
    },

    _injectSidebar: function () {
      var oViewDom = this.getView().getDomRef();
      if (!oViewDom) { return; }
      // Guard: view-scoped check so re-renders after invalidate() are safe
      if (oViewDom.querySelector("#sk-sidebar")) { return; }

      var oUser     = JSON.parse(sessionStorage.getItem("sysko_user") || "{}");
      var sName     = oUser.name || "Dipendente";
      var sInitials = sName.split(" ")
        .map(function (w) { return (w[0] || "").toUpperCase(); })
        .join("").slice(0, 2) || "?";

      var sSidebar =
        '<div id="sk-sidebar" class="sk-sidebar">' +
          '<div class="sk-sidebar-logo">' +
            '<div class="sk-logo-circle">SK</div>' +
            '<span class="sk-logo-brand">SYSKO</span>' +
          '</div>' +
          '<nav class="sk-nav">' +
            '<a class="sk-nav-item" data-route="main">' +
              '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">' +
                '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>' +
                '<polyline points="9 22 9 12 15 12 15 22"/>' +
              '</svg>Le Mie Ferie' +
            '</a>' +
            '<a class="sk-nav-item" data-route="calendario">' +
              '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">' +
                '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
                '<line x1="16" y1="2" x2="16" y2="6"/>' +
                '<line x1="8" y1="2" x2="8" y2="6"/>' +
                '<line x1="3" y1="10" x2="21" y2="10"/>' +
              '</svg>Calendario' +
            '</a>' +
          '</nav>' +
          '<div class="sk-sidebar-footer">' +
            '<div class="sk-avatar">' + esc(sInitials) + '</div>' +
            '<div class="sk-user-info">' +
              '<span class="sk-user-name">' + esc(sName) + '</span>' +
              '<span class="sk-user-role">Dipendente</span>' +
            '</div>' +
            '<a class="sk-logout" href="/index.html" title="Esci">' +
              '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">' +
                '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>' +
                '<polyline points="16 17 21 12 16 7"/>' +
                '<line x1="21" y1="12" x2="9" y2="12"/>' +
              '</svg>' +
            '</a>' +
          '</div>' +
        '</div>';

      oViewDom.classList.add("sk-layout");
      oViewDom.insertAdjacentHTML("afterbegin", sSidebar);

      /* Wire nav clicks to UI5 router */
      var oRouter = this.getOwnerComponent().getRouter();
      oViewDom.querySelectorAll(".sk-nav-item").forEach(function (el) {
        el.addEventListener("click", function (e) {
          e.preventDefault();
          oRouter.navTo(el.dataset.route);
        });
      });
    },

    _onRouteMatched: function (oEvent) {
      var sRoute   = oEvent.getParameter("name");
      var oSidebar = document.getElementById("sk-sidebar");
      if (!oSidebar) { return; } // sidebar not yet injected (async timing edge case)
      oSidebar.querySelectorAll(".sk-nav-item").forEach(function (el) {
        el.classList.toggle("sk-nav-active", el.dataset.route === sRoute);
      });
    }

  });
});
