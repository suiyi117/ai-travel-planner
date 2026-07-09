(function () {
  function setEmptyHtml(element, html) {
    if (element) {
      element.innerHTML = html;
    }
  }

  window.AeroTravelRender = Object.freeze({ setEmptyHtml });
})();
