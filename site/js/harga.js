/* Render the public catalog and configure manual payment confirmation. */
(function () {
  'use strict';
  const config = window.SIMPLEYN_CONFIG;
  const U = window.SY;
  if (!config || !U) return;

  const allProducts = config.bundles.concat(config.singles);
  const whatsapp = document.getElementById('whatsapp-link');
  const summary = document.getElementById('selection-summary');
  let currentProduct = null;
  let pendingRequest = null;
  let purchasing = false;

  function selectProduct(product, card) {
    allProducts.forEach(function (item) {
      const node = document.getElementById('product-' + item.id);
      if (node) node.classList.remove('selected');
    });
    card.classList.add('selected');
    currentProduct = product;
    pendingRequest = null;
    purchasing = false;
    summary.textContent = 'Pilihanmu: ' + product.name + ' — ' + U.rp(product.price);
    document.getElementById('plus-choice-field').hidden = product.id !== 'plus';
    document.getElementById('plus-extra').disabled = false;
    whatsapp.removeAttribute('href');
    whatsapp.removeAttribute('target');
    whatsapp.removeAttribute('aria-disabled');
    whatsapp.removeAttribute('aria-busy');
    whatsapp.classList.remove('btn-disabled');
    document.getElementById('payment-status').textContent = 'Setelah menekan tombol, permintaan pembelianmu dicatat sebagai pending. Pembayaran diverifikasi oleh admin.';
  }

  whatsapp.addEventListener('click', async function (event) {
    if (pendingRequest) return; /* Request already exists: open the real wa.me link only. */
    event.preventDefault();
    if (purchasing || !currentProduct) return;
    const number = config.payment.whatsAppNumber;
    const status = document.getElementById('payment-status');
    if (!/^\d{8,15}$/.test(number)) {
      status.textContent = 'Nomor WhatsApp belum diatur oleh pengelola.';
      return;
    }
    if (!window.SYAuth || !window.SYAuth.client) {
      status.textContent = 'Supabase belum dihubungkan oleh pengelola. Pembelian belum dapat dicatat.';
      return;
    }
    purchasing = true;
    whatsapp.setAttribute('aria-busy', 'true');
    status.textContent = 'Memeriksa sesi dan mencatat permintaan pembelian…';
    try {
      const user = await window.SYAuth.currentUser();
      if (!user) {
        window.location.assign('/login.html?berikut=' + encodeURIComponent('/harga.html?paket=' + currentProduct.id));
        return;
      }
      const selectedTool = currentProduct.id === 'plus' ? document.getElementById('plus-extra').value : null;
      const result = await window.SYAuth.client.from('purchase_requests').insert({
        plan_id: currentProduct.id, selected_tool: selectedTool
      }).select('id,amount,status,plan_id,selected_tool').single();
      if (result.error || !result.data || result.data.status !== 'pending') throw new Error('Permintaan belum tersimpan. Coba lagi tanpa mengubah data pembelian.');
      pendingRequest = result.data;
      document.getElementById('plus-extra').disabled = true;
      const toolText = pendingRequest.selected_tool ? ' dengan alat tambahan ' + pendingRequest.selected_tool : '';
      const message = 'Halo, saya ingin konfirmasi pembelian ' + currentProduct.name + toolText + ' (' + U.rp(pendingRequest.amount) + ') di Simple.yn. Nomor permintaan: ' + pendingRequest.id + '. Berikut bukti pembayaran saya.';
      whatsapp.href = 'https://wa.me/' + number + '?text=' + encodeURIComponent(message);
      whatsapp.target = '_blank';
      status.textContent = 'Permintaan tercatat sebagai pending di akunmu. Kirim bukti pembayaran lewat WhatsApp dan masukkan nomor permintaan di atas.';
      whatsapp.click();
    } catch (error) {
      status.textContent = error.message || 'Belum dapat mencatat permintaan. Coba muat ulang halaman.';
    } finally {
      purchasing = false;
      whatsapp.removeAttribute('aria-busy');
    }
  });

  function buyButton(product) {
    const button = U.el(product.popular ? 'button' : 'button', product.popular ? 'btn btn-primary' : 'btn btn-outline', 'Beli');
    button.type = 'button';
    button.addEventListener('click', function () {
      selectProduct(product, document.getElementById('product-' + product.id));
      document.getElementById('cara-bayar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return button;
  }

  function renderBundle(product) {
    const card = U.el('article', 'bundle' + (product.popular ? ' pop' : ''));
    card.id = 'product-' + product.id;
    if (product.popular) U.add(card, U.el('span', 'pop-badge badge badge-accent', 'Paling Populer'));
    U.add(card,
      U.el('h3', '', product.name),
      U.el('div', 'bundle-sub', product.subtitle)
    );
    const prices = U.el('div', 'price-line');
    U.add(prices, U.el('span', 'price-now', U.rp(product.price)), U.el('span', 'price-old', U.rp(product.oldPrice)));
    const saving = U.el('div', 'save-badge');
    saving.append(U.el('span', 'badge badge-accent', 'Hemat ' + U.rp(product.saving)));
    const includes = U.el('ul');
    product.includes.forEach(function (item) {
      includes.append(U.add(U.el('li'), U.icon('check'), U.el('span', '', item)));
    });
    U.add(card, prices, saving, includes, buyButton(product));
    return card;
  }

  function detail(container, title, value) {
    const row = U.el('div', 'detail-row');
    U.add(row, U.el('dt', '', title), U.el('dd', '', value));
    container.append(row);
  }

  const bundleRoot = document.getElementById('bundles');
  config.bundles.forEach(function (bundle) { bundleRoot.append(renderBundle(bundle)); });

  const singleRoot = document.getElementById('singles');
  config.singles.forEach(function (product) {
    const card = U.el('article', 'single');
    card.id = 'product-' + product.id;
    card.append(U.add(U.el('div', 'single-ico'), U.icon(product.icon)));
    card.append(U.add(U.el('div'), U.el('b', '', product.name), U.el('span', 'muted', U.rp(product.price))));
    const action = buyButton(product);
    action.classList.add('btn-sm');
    card.append(action);
    singleRoot.append(card);
  });

  const qrisUrl = new URL(config.payment.qrisImagePath, window.location.href);
  if (qrisUrl.origin === window.location.origin) {
    const qris = U.el('img');
    qris.alt = 'Kode QRIS resmi Simple.yn';
    qris.addEventListener('load', function () { qris.hidden = false; document.getElementById('qris-placeholder').hidden = true; });
    qris.src = qrisUrl.href;
    qris.hidden = true;
    document.querySelector('.qr-frame').prepend(qris);
  }

  const requestedId = new URLSearchParams(window.location.search).get('paket');
  const initialProduct = allProducts.find(function (item) { return item.id === requestedId; }) || config.bundles.find(function (item) { return item.id === 'plus'; });
  const initialCard = document.getElementById('product-' + initialProduct.id);
  if (initialCard) selectProduct(initialProduct, initialCard);
}());
