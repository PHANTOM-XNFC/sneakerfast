(function () {
  "use strict";

  var STORAGE_KEY = "sneakerfast_order_v1";
  var QTY_KEY = "sneakerfast_order_qty_v1";
  var MIN_ORDER = 499;
  var FREIGHT_FREE = 1000;
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

  function trackContact(sku) {
    if (typeof window.fbq !== "function") return;
    var payload = { contact_method: "whatsapp" };
    if (sku) {
      var p = productsBySku[sku];
      payload.content_ids = [sku];
      payload.content_type = "product";
      payload.content_name = p ? (p.model || "") : "";
      payload.value = p && p.wholesale != null ? Number(p.wholesale) : 0;
      payload.currency = "BRL";
    }
    window.fbq("track", "Contact", payload);
  }

  function openWhatsApp(message) {
    window.location.href = buildWhatsAppUrl(message);
  }

  function getOrder() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var seen = {};
      var out = [];
      parsed.forEach(function (item) {
        var sku = typeof item === "string" ? item : (item && item.sku);
        if (!sku || seen[sku]) return;
        seen[sku] = true;
        out.push(sku);
      });
      return out;
    } catch (e) {
      return [];
    }
  }

  function getQtyMap() {
    try {
      var parsed = JSON.parse(localStorage.getItem(QTY_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function pruneQtyMap(items) {
    var map = getQtyMap();
    Object.keys(map).forEach(function (sku) {
      if (items.indexOf(sku) === -1) delete map[sku];
    });
    localStorage.setItem(QTY_KEY, JSON.stringify(map));
    return map;
  }

  function getQty(sku) {
    var n = parseInt(getQtyMap()[sku], 10);
    return n >= 1 ? n : 1;
  }

  function setQty(sku, qty) {
    var n = parseInt(qty, 10);
    if (!isFinite(n) || n < 1) n = 1;
    var map = pruneQtyMap(getOrder());
    map[sku] = n;
    localStorage.setItem(QTY_KEY, JSON.stringify(map));
    return n;
  }

  function saveOrder(items) {
    var unique = [];
    var seen = {};
    (items || []).forEach(function (sku) {
      if (!sku || seen[sku]) return;
      seen[sku] = true;
      unique.push(sku);
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
    pruneQtyMap(unique);
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

  function formatBrl(value) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    var parts = n.toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "R$" + parts[0] + "," + parts[1];
  }

  function escHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function getOrderLines() {
    return getOrder().map(function (sku) {
      var p = productsBySku[sku];
      var qty = getQty(sku);
      var unit = p && p.wholesale != null ? Number(p.wholesale) : 0;
      return {
        sku: sku,
        product: p,
        qty: qty,
        unit: unit,
        subtotal: unit * qty,
        title: p ? (p.title || p.model || sku) : sku,
      };
    }).filter(function (line) { return line.product; });
  }

  var orderSendBound = false;
  var checkoutUiBound = false;
  var initiateCheckoutFired = false;

  function orderWholesaleTotal(items) {
    var total = 0;
    (items || getOrder()).forEach(function (sku) {
      var p = productsBySku[sku];
      var qty = getQty(sku);
      if (p && p.wholesale != null) total += Number(p.wholesale) * qty;
    });
    return total;
  }

  function freightLabel(total) {
    return total >= FREIGHT_FREE ? "GRÁTIS ✅" : "A CALCULAR";
  }

  function maskCep(value) {
    var digits = String(value || "").replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 5) return digits;
    return digits.slice(0, 5) + "-" + digits.slice(5);
  }

  function selectedRadio(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }

  function trackInitiateCheckout(items) {
    if (initiateCheckoutFired || !items.length || typeof window.fbq !== "function") return;
    initiateCheckoutFired = true;
    window.fbq("track", "InitiateCheckout", {
      content_ids: items.slice(),
      content_type: "product",
      num_items: items.reduce(function (sum, sku) { return sum + getQty(sku); }, 0),
      value: orderWholesaleTotal(items),
      currency: "BRL",
    });
  }

  function renderCheckout() {
    var host = document.getElementById("checkoutLines");
    var summary = document.getElementById("checkoutSummary");
    var warn = document.getElementById("checkoutMinWarn");
    var sendBtn = document.getElementById("checkoutWhatsApp");
    if (!host || !summary) return;
    var lines = getOrderLines();
    var total = 0;
    host.innerHTML = lines.map(function (line) {
      total += line.subtotal;
      return (
        '<div class="checkout-line">' +
          '<img src="' + line.product.cover + '" alt="">' +
          '<div class="checkout-line-copy">' +
            "<strong>" + escHtml(line.sku) + "</strong>" +
            "<span>" + escHtml(line.title) + "</span>" +
            '<div class="checkout-line-meta">Unitário ' + formatBrl(line.unit) + " • Subtotal " + formatBrl(line.subtotal) + "</div>" +
            '<div class="checkout-qty">' +
              '<button type="button" data-qty-minus="' + escHtml(line.sku) + '" aria-label="Diminuir">−</button>' +
              '<input type="number" min="1" step="1" inputmode="numeric" data-qty-input="' + escHtml(line.sku) + '" value="' + line.qty + '">' +
              '<button type="button" data-qty-plus="' + escHtml(line.sku) + '" aria-label="Aumentar">+</button>' +
            "</div>" +
          "</div>" +
        "</div>"
      );
    }).join("");
    summary.innerHTML =
      "<div>TOTAL PARCIAL: <strong>" + formatBrl(total) + "</strong></div>" +
      "<div>FRETE: <strong>" + freightLabel(total) + "</strong></div>";
    var belowMin = total < MIN_ORDER;
    if (warn) warn.hidden = !belowMin;
    if (sendBtn) {
      sendBtn.disabled = belowMin || !lines.length;
      sendBtn.setAttribute("aria-disabled", belowMin || !lines.length ? "true" : "false");
    }
  }

  function buildCheckoutMessage() {
    var lines = getOrderLines();
    var total = 0;
    var blocks = [
      "Olá! Vim pelo site da SneakerFast e gostaria de finalizar este pedido:",
      "",
      "🛍️ PEDIDO SELECIONADO",
      "",
    ];
    lines.forEach(function (line) {
      total += line.subtotal;
      blocks.push(line.qty + "x " + line.sku + " — " + line.title);
      blocks.push(formatBrl(line.unit) + " cada | " + formatBrl(line.subtotal));
      blocks.push("");
    });
    var typeValue = selectedRadio("checkoutClientType");
    var typeLabel = typeValue === "pj" ? "Empresa (CNPJ)" : "Pessoa Física (CPF)";
    var receiveValue = selectedRadio("checkoutReceive");
    var receiveLabel = receiveValue === "retirada" ? "Retirada no estoque" : "Envio";
    var name = (document.getElementById("checkoutName") || {}).value || "";
    var city = (document.getElementById("checkoutCity") || {}).value || "";
    var uf = (document.getElementById("checkoutUf") || {}).value || "";
    var cep = (document.getElementById("checkoutCep") || {}).value || "";
    blocks.push("━━━━━━━━━━━━━━");
    blocks.push("TOTAL PARCIAL: " + formatBrl(total));
    blocks.push("FRETE: " + freightLabel(total));
    blocks.push("━━━━━━━━━━━━━━");
    blocks.push("");
    blocks.push("👤 DADOS DO CLIENTE");
    blocks.push("");
    blocks.push("Nome: " + name.trim());
    blocks.push("Tipo: " + typeLabel);
    blocks.push("Cidade/UF: " + city.trim() + "/" + uf);
    blocks.push("CEP: " + cep.trim());
    blocks.push("Recebimento: " + receiveLabel);
    blocks.push("");
    blocks.push("🌐 Pedido realizado em:");
    blocks.push("https://sneakersfast.com.br/");
    blocks.push("");
    blocks.push("Gostaria de confirmar disponibilidade, prazo de envio e pagamento.");
    return blocks.join("\n");
  }

  function validateCheckoutForm() {
    var error = document.getElementById("checkoutFormError");
    function fail(msg) {
      if (error) {
        error.hidden = false;
        error.textContent = msg;
      }
      return false;
    }
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
    var name = ((document.getElementById("checkoutName") || {}).value || "").trim();
    var city = ((document.getElementById("checkoutCity") || {}).value || "").trim();
    var uf = ((document.getElementById("checkoutUf") || {}).value || "").trim();
    var cep = maskCep((document.getElementById("checkoutCep") || {}).value || "");
    if (!name) return fail("Informe o nome completo.");
    if (!selectedRadio("checkoutClientType")) return fail("Selecione o tipo de cliente.");
    if (!city) return fail("Informe a cidade.");
    if (!uf) return fail("Selecione a UF.");
    if (!/^\d{5}-\d{3}$/.test(cep)) return fail("Informe um CEP válido (00000-000).");
    if (!selectedRadio("checkoutReceive")) return fail("Selecione a forma de recebimento.");
    return true;
  }

  function openCheckoutModal() {
    var items = getOrder();
    if (!items.length) return;
    var panel = document.getElementById("orderPanel");
    var overlay = document.getElementById("orderOverlay");
    var modal = document.getElementById("checkoutModal");
    var checkoutOverlay = document.getElementById("checkoutOverlay");
    closePanel(panel, overlay);
    renderCheckout();
    trackInitiateCheckout(items);
    if (modal) modal.hidden = false;
    if (checkoutOverlay) checkoutOverlay.hidden = false;
    var first = document.getElementById("checkoutName");
    if (first) setTimeout(function () { first.focus(); }, 50);
  }

  function closeCheckoutModal(backToOrder) {
    var modal = document.getElementById("checkoutModal");
    var checkoutOverlay = document.getElementById("checkoutOverlay");
    if (modal) modal.hidden = true;
    if (checkoutOverlay) checkoutOverlay.hidden = true;
    if (backToOrder) {
      renderOrderPanel();
      openPanel(document.getElementById("orderPanel"), document.getElementById("orderOverlay"));
    }
  }

  function continueCheckoutWhatsApp() {
    var items = getOrder();
    if (!items.length) return;
    var total = orderWholesaleTotal(items);
    if (total < MIN_ORDER) {
      renderCheckout();
      return;
    }
    if (!validateCheckoutForm()) return;
    trackCustom("WholesaleOrder", { content_ids: items, num_items: items.reduce(function (sum, sku) { return sum + getQty(sku); }, 0), currency: "BRL" });
    openWhatsApp(buildCheckoutMessage());
  }

  function sendOrderToWhatsApp() {
    openCheckoutModal();
  }

  function addToOrder(sku) {
    var items = getOrder();
    if (items.indexOf(sku) !== -1) {
      renderOrderPanel();
      return;
    }
    items.push(sku);
    saveOrder(items);
    setQty(sku, 1);
    var p = productsBySku[sku];
    if (typeof window.fbq === "function") {
      window.fbq("track", "AddToCart", {
        content_ids: [sku],
        content_type: "product",
        content_name: p ? (p.model || "") : "",
        value: p && p.wholesale != null ? Number(p.wholesale) : 0,
        currency: "BRL",
      });
    }
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
          trackContact(sku);
          openWhatsApp(buildSingleMessage(sku));
          return;
        }
        trackContact();
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
    if (sendBtn && !orderSendBound) {
      orderSendBound = true;
      sendBtn.addEventListener("click", function () {
        sendOrderToWhatsApp();
      });
    }

    var checkoutBack = document.getElementById("checkoutBack");
    var checkoutClose = document.getElementById("closeCheckoutModal");
    var checkoutSend = document.getElementById("checkoutWhatsApp");
    var checkoutOverlay = document.getElementById("checkoutOverlay");
    var checkoutCep = document.getElementById("checkoutCep");
    var checkoutBody = document.querySelector(".checkout-modal-body");

    if (!checkoutUiBound) {
      checkoutUiBound = true;
      if (checkoutBack) checkoutBack.addEventListener("click", function () { closeCheckoutModal(true); });
      if (checkoutClose) checkoutClose.addEventListener("click", function () { closeCheckoutModal(true); });
      if (checkoutOverlay) checkoutOverlay.addEventListener("click", function () { closeCheckoutModal(true); });
      if (checkoutSend) checkoutSend.addEventListener("click", continueCheckoutWhatsApp);
      if (checkoutCep) {
        checkoutCep.addEventListener("input", function () {
          checkoutCep.value = maskCep(checkoutCep.value);
        });
      }

      document.addEventListener("click", function (e) {
        var target = e.target;
        if (!(target instanceof HTMLElement)) return;
        var minus = target.getAttribute("data-qty-minus");
        var plus = target.getAttribute("data-qty-plus");
        if (minus) {
          setQty(minus, getQty(minus) - 1);
          renderCheckout();
        }
        if (plus) {
          setQty(plus, getQty(plus) + 1);
          renderCheckout();
        }
      });
      document.addEventListener("change", function (e) {
        var target = e.target;
        if (!(target instanceof HTMLElement)) return;
        var sku = target.getAttribute("data-qty-input");
        if (!sku) return;
        setQty(sku, target.value);
        renderCheckout();
      });

      if (window.visualViewport) {
        var syncKeyboard = function () {
          var inset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
          document.documentElement.style.setProperty("--keyboard-inset", inset + "px");
          var modal = document.getElementById("checkoutModal");
          if (modal && !modal.hidden && document.activeElement && checkoutBody) {
            document.activeElement.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        };
        window.visualViewport.addEventListener("resize", syncKeyboard);
        window.visualViewport.addEventListener("scroll", syncKeyboard);
      }

      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        var modal = document.getElementById("checkoutModal");
        if (modal && !modal.hidden) {
          closeCheckoutModal(true);
          return;
        }
        closePanel(panel, overlay);
      });
    }

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
      '<label>Categoria<select id="filterCategory">' + options(uniqueValues("category"), q.categoria) + "</select></label>" +
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
      if (q && (p.search || "").indexOf(q) === -1) return false;
      if (filters.brand && p.brand !== filters.brand) return false;
      if (filters.category && p.category !== filters.category) return false;
      if (filters.color && p.color !== filters.color) return false;
      if (filters.grade && (p.grade || "") !== filters.grade) return false;
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
          if (typeof btn.scrollIntoView === "function") {
            btn.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
          }
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
