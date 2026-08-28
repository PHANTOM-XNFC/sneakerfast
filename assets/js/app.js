(function () {
  "use strict";

  var STORAGE_KEY = "sneakerfast_order_v1";
  var catalog = window.SNEAKERFAST_CATALOG || { products: [], launches: [] };
  var productsBySku = {};
  catalog.products.forEach(function (p) {
    productsBySku[p.sku] = p;
  });

  var OFFICIAL_WHATSAPP_URL = "https://wa.me/5511965403753";
  var body = document.body;
  var pixelId = (body.getAttribute("data-meta-pixel-id") || "").replace(/\D/g, "");
  var page = body.getAttribute("data-page") || "home";

  function buildWhatsAppUrl(message) {
    if (!message) return OFFICIAL_WHATSAPP_URL;
    return OFFICIAL_WHATSAPP_URL + "?text=" + encodeURIComponent(message);
  }

  function openWhatsApp(message) {
    trackPixel("Contact");
    window.location.href = buildWhatsAppUrl(message);
  }

  function getOrder() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveOrder(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateOrderBar();
  }

  function trackPixel(eventName, params) {
    if (!pixelId || typeof window.fbq !== "function") return;
    window.fbq("track", eventName, params || {});
  }

  function trackCustom(eventName, params) {
    if (!pixelId || typeof window.fbq !== "function") return;
    window.fbq("trackCustom", eventName, params || {});
  }

  function buildSingleMessage(sku) {
    var p = productsBySku[sku];
    if (!p) return "Olá! Gostaria de consultar produtos no atacado.";
    return (
      "Olá! Tenho interesse no " + p.title + " - SKU " + p.sku + ".\nGrade: " +
      (p.grade || "—") + "\nAtacado: " + p.wholesale_label
    );
  }

  function buildOrderMessage(items) {
    var lines = ["Olá! Gostaria de consultar estes produtos no atacado:", ""];
    items.forEach(function (sku) {
      var p = productsBySku[sku];
      if (!p) return;
      lines.push(p.sku, p.title, "Grade: " + (p.grade || "—"), "Atacado: " + p.wholesale_label, "");
    });
    lines.push("Total de modelos selecionados: " + items.length, "", "Gostaria de consultar disponibilidade e fechar o pedido.");
    return lines.join("\n");
  }

  function addToOrder(sku) {
    var items = getOrder();
    if (items.indexOf(sku) === -1) {
      items.push(sku);
      saveOrder(items);
    }
    var p = productsBySku[sku];
    trackPixel("AddToCart", {
      content_ids: [sku],
      content_type: "product",
      value: p ? p.wholesale : 0,
      currency: "BRL",
    });
    renderOrderPanel();
  }

  function removeFromOrder(sku) {
    saveOrder(getOrder().filter(function (s) { return s !== sku; }));
    renderOrderPanel();
  }

  function updateOrderBar() {
    var count = getOrder().length;
    var bar = document.getElementById("orderBar");
    var barBtn = document.getElementById("orderBarBtn");
    if (barBtn) {
      barBtn.textContent = "PEDIDO • " + count + (count === 1 ? " MODELO" : " MODELOS");
    }
    if (bar) bar.hidden = count === 0;
  }

  function renderOrderPanel() {
    var host = document.getElementById("orderItems");
    if (!host) return;
    var items = getOrder();
    host.innerHTML = items.length
      ? items.map(function (sku) {
          var p = productsBySku[sku];
          if (!p) return "";
          return (
            '<div class="order-item"><img src="' + p.cover + '" alt="">' +
            '<div class="order-item-copy"><strong>' + p.sku + "</strong><span>" + p.title +
            '</span><small>Grade: ' + (p.grade || "—") + " • " + p.wholesale_label +
            '</small></div><button type="button" class="order-remove" data-remove-order="' +
            sku + '">Remover</button></div>'
          );
        }).join("")
      : '<p class="muted">Nenhum modelo no pedido.</p>';
  }

  function closePanel(panel, overlay) {
    if (panel) panel.hidden = true;
    if (overlay) overlay.hidden = true;
  }

  function openPanel(panel, overlay) {
    if (panel) panel.hidden = false;
    if (overlay) overlay.hidden = false;
  }

  function setupWhatsAppButtons() {
    document.querySelectorAll("[data-whatsapp]").forEach(function (button) {
      button.addEventListener("click", function () {
        var sku = body.getAttribute("data-sku");
        if (sku && page === "product") {
          openWhatsApp(buildSingleMessage(sku));
          return;
        }
        openWhatsApp("Olá! Gostaria de consultar produtos SneakerFast no atacado.");
      });
    });
  }

  function setupOrderUi() {
    if (!document.getElementById("orderBar")) return;

    document.querySelectorAll("[data-add-order]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var sku = btn.getAttribute("data-add-order");
        if (sku) addToOrder(sku);
      });
    });

    var panel = document.getElementById("orderPanel");
    var overlay = document.getElementById("orderOverlay");
    var barBtn = document.getElementById("orderBarBtn");
    var closeBtn = document.getElementById("closeOrderPanel");

    if (barBtn) {
      barBtn.addEventListener("click", function () {
        renderOrderPanel();
        openPanel(panel, overlay);
      });
    }
    if (closeBtn) closeBtn.addEventListener("click", function () { closePanel(panel, overlay); });
    if (overlay) overlay.addEventListener("click", function () { closePanel(panel, overlay); });

    document.addEventListener("click", function (e) {
      var target = e.target;
      if (!(target instanceof HTMLElement)) return;
      var removeSku = target.getAttribute("data-remove-order");
      if (removeSku) removeFromOrder(removeSku);
    });

    var sendBtn = document.getElementById("sendOrderWhatsApp");
    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        var items = getOrder();
        if (!items.length) return;
        trackCustom("WholesaleOrder", { content_ids: items, num_items: items.length, currency: "BRL" });
        openWhatsApp(buildOrderMessage(items));
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePanel(panel, overlay);
    });

    updateOrderBar();
    renderOrderPanel();
    closePanel(panel, overlay);
  }

  function setupHeader() {
    var menuBtn = document.getElementById("menuBtn");
    var nav = document.getElementById("mobileNav");
    var navOverlay = document.getElementById("navOverlay");
    var closeNav = document.getElementById("closeMobileNav");

    function closeMobileNav() {
      if (nav) nav.hidden = true;
      if (navOverlay) navOverlay.hidden = true;
      document.body.classList.remove("nav-open");
    }
    function openMobileNav() {
      if (nav) nav.hidden = false;
      if (navOverlay) navOverlay.hidden = false;
      document.body.classList.add("nav-open");
    }

    if (menuBtn) menuBtn.addEventListener("click", openMobileNav);
    if (closeNav) closeNav.addEventListener("click", closeMobileNav);
    if (navOverlay) navOverlay.addEventListener("click", closeMobileNav);

    var searchBtn = document.getElementById("headerSearchBtn");
    var searchBox = document.getElementById("headerSearch");
    if (searchBtn && searchBox) {
      searchBtn.addEventListener("click", function () {
        searchBox.hidden = !searchBox.hidden;
        var input = document.getElementById("quickSearch");
        if (input && !searchBox.hidden) input.focus();
      });
    }

    var quickSearch = document.getElementById("quickSearch");
    if (quickSearch) {
      quickSearch.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          var q = quickSearch.value.trim();
          window.location.href = "catalogo.html" + (q ? "?q=" + encodeURIComponent(q) : "");
        }
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMobileNav();
    });
    closeMobileNav();
  }

  function parseQuery() {
    var params = new URLSearchParams(window.location.search);
    return { q: params.get("q") || "", marca: params.get("marca") || "", categoria: params.get("categoria") || "" };
  }

  function uniqueValues(key) {
    var set = {};
    catalog.products.forEach(function (p) { if (p[key]) set[p[key]] = true; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
  }

  function getFilters() {
    return {
      brand: (document.getElementById("filterBrand") || {}).value || "",
      category: (document.getElementById("filterCategory") || {}).value || "",
      color: (document.getElementById("filterColor") || {}).value || "",
      grade: (document.getElementById("filterGrade") || {}).value || "",
      minPrice: parseFloat((document.getElementById("filterMinPrice") || {}).value || "0") || 0,
      maxPrice: parseFloat((document.getElementById("filterMaxPrice") || {}).value || "0") || 0,
    };
  }

  function renderFilterForm() {
    var host = document.getElementById("filterForm");
    if (!host) return;
    var q = parseQuery();
    function options(list, selected) {
      return '<option value="">Todos</option>' + list.map(function (v) {
        return '<option value="' + v.replace(/"/g, "&quot;") + '"' + (selected === v ? " selected" : "") + ">" + v + "</option>";
      }).join("");
    }
    host.innerHTML =
      '<label>Marca<select id="filterBrand">' + options(uniqueValues("brand"), q.marca) + "</select></label>" +
      '<label>Categoria<select id="filterCategory">' + options(catalog.categories || uniqueValues("category"), q.categoria) + "</select></label>" +
      '<label>Cor<select id="filterColor">' + options(uniqueValues("color"), "") + "</select></label>" +
      '<label>Grade<select id="filterGrade">' + options(uniqueValues("grade"), "") + "</select></label>" +
      '<label>Preço mínimo<input type="number" id="filterMinPrice" min="0" step="1"></label>' +
      '<label>Preço máximo<input type="number" id="filterMaxPrice" min="0" step="1"></label>';
  }

  function sortProducts(list, mode) {
    var copy = list.slice();
    copy.sort(function (a, b) {
      if (mode === "price_asc") return (a.wholesale || 0) - (b.wholesale || 0);
      if (mode === "price_desc") return (b.wholesale || 0) - (a.wholesale || 0);
      if (mode === "az") return a.title.localeCompare(b.title, "pt-BR");
      return (b.created_at || "").localeCompare(a.created_at || "") || (b.sku_num || 0) - (a.sku_num || 0);
    });
    return copy;
  }

  function productCardHtml(item) {
    return (
      '<article class="product-card" data-sku="' + item.sku + '">' +
      '<a class="product-card-link" href="' + item.url + '"><img src="' + item.cover + '" alt="' + item.title.replace(/"/g, "&quot;") + '" loading="lazy">' +
      '<div class="product-card-body"><div class="sku">' + item.sku + "</div><h3>" + item.title + '</h3>' +
      '<div class="price-row"><div class="price"><small>ATACADO</small><strong>' + item.wholesale_label +
      '</strong></div><div class="price"><small>GRADE</small><strong>' + (item.grade || "—") + "</strong></div></div></div></a>" +
      '<button class="btn-add-order" type="button" data-add-order="' + item.sku + '">+ ADICIONAR AO PEDIDO</button>' +
      '<a class="card-cta" href="' + item.url + '">VER PRODUTO</a></article>'
    );
  }

  function renderCatalogGrid() {
    var grid = document.getElementById("catalogGrid");
    if (!grid) return;
    var searchInput = document.getElementById("catalogSearch");
    var sortSelect = document.getElementById("catalogSort");
    var q = (searchInput && searchInput.value.trim().toLowerCase()) || parseQuery().q.toLowerCase();
    var filters = getFilters();
    if (!filters.brand && parseQuery().marca) filters.brand = parseQuery().marca;
    if (!filters.category && parseQuery().categoria) filters.category = parseQuery().categoria;

    var list = catalog.products.filter(function (p) {
      if (q && p.search.indexOf(q) === -1) return false;
      if (filters.brand && p.brand !== filters.brand) return false;
      if (filters.category && p.category !== filters.category) return false;
      if (filters.color && p.color !== filters.color) return false;
      if (filters.grade && p.grade !== filters.grade) return false;
      if (filters.minPrice && (p.wholesale || 0) < filters.minPrice) return false;
      if (filters.maxPrice && (p.wholesale || 0) > filters.maxPrice) return false;
      return true;
    });
    list = sortProducts(list, sortSelect ? sortSelect.value : "recent");
    grid.innerHTML = list.map(productCardHtml).join("");
    var meta = document.getElementById("resultsMeta");
    if (meta) meta.textContent = list.length + " produto(s) encontrado(s)";
    var empty = document.getElementById("catalogEmpty");
    if (empty) empty.hidden = list.length > 0;
    setupOrderUi();
  }

  function setupCatalogPage() {
    var drawer = document.getElementById("filterDrawer");
    var overlay = document.getElementById("filterOverlay");
    if (!drawer) return;

    renderFilterForm();
    closePanel(drawer, overlay);

    var searchInput = document.getElementById("catalogSearch");
    var sortSelect = document.getElementById("catalogSort");
    var q = parseQuery();
    if (searchInput && q.q) searchInput.value = q.q;
    if (searchInput) searchInput.addEventListener("input", renderCatalogGrid);
    if (sortSelect) sortSelect.addEventListener("change", renderCatalogGrid);

    document.getElementById("openFilterDrawer").addEventListener("click", function () {
      renderFilterForm();
      openPanel(drawer, overlay);
    });
    document.getElementById("closeFilterDrawer").addEventListener("click", function () { closePanel(drawer, overlay); });
    if (overlay) overlay.addEventListener("click", function () { closePanel(drawer, overlay); });
    document.getElementById("applyFilters").addEventListener("click", function () {
      closePanel(drawer, overlay);
      renderCatalogGrid();
    });
    document.getElementById("clearFilters").addEventListener("click", function () {
      ["filterBrand", "filterCategory", "filterColor", "filterGrade", "filterMinPrice", "filterMaxPrice"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = "";
      });
      renderCatalogGrid();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePanel(drawer, overlay);
    });

    renderCatalogGrid();
  }

  function setupProductGallery() {
    var main = document.getElementById("mainPhoto");
    var gallery = document.getElementById("productGallery");
    if (!main || !gallery) return;
    var thumbs = Array.prototype.slice.call(document.querySelectorAll(".gallery-thumb"));
    var images = thumbs.map(function (btn) { return btn.getAttribute("data-full"); });
    if (!images.length && main.src) images = [main.src];
    thumbs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var src = btn.getAttribute("data-full");
        if (main && src) {
          main.src = src;
          thumbs.forEach(function (b) { b.classList.remove("is-active"); });
          btn.classList.add("is-active");
        }
      });
    });
    var lightbox = document.getElementById("lightbox");
    var lightboxImg = document.getElementById("lightboxImg");
    if (main && lightbox && lightboxImg) {
      main.addEventListener("click", function () { lightboxImg.src = main.src; lightbox.hidden = false; });
    }
    var closeLightbox = document.getElementById("closeLightbox");
    if (closeLightbox && lightbox) closeLightbox.addEventListener("click", function () { lightbox.hidden = true; });
  }

  function setupProductPage() {
    var sku = body.getAttribute("data-sku");
    if (!sku) return;
    var p = productsBySku[sku];
    if (p) trackPixel("ViewContent", { content_ids: [sku], content_type: "product", value: p.wholesale || 0, currency: "BRL" });
    setupProductGallery();
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupWhatsAppButtons();
    setupHeader();
    setupOrderUi();
    if (page === "catalog") setupCatalogPage();
    if (page === "product") setupProductPage();
  });
})();
