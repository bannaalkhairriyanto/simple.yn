/* EDIT THIS FILE ONLY to change products and payment details. */
window.SIMPLEYN_CONFIG = {
  /* Public project identifiers only. Never put a service-role key or secret here. */
  supabaseUrl: 'https://pwshbnunqzgsqhidadse.supabase.co',
  supabaseAnonKey: 'sb_publishable__Tm0ppYK5Bnd8eqwdK-K6Q_PzMyEUbX',
  bundles: [
    {
      id: 'hemat',
      name: 'Hemat',
      subtitle: 'Dua alat untuk urusan harian',
      price: 10000,
      oldPrice: 18000,
      saving: 8000,
      includes: ['Money Tracker', 'Study Planner'],
      popular: false
    },
    {
      id: 'plus',
      name: 'Plus',
      subtitle: 'Ringkasan materi + satu alat pilihanmu',
      price: 17000,
      oldPrice: 21000,
      saving: 4000,
      includes: ['Course Summaries (Ringkasan Materi)', '1 alat tambahan sesuai pilihanmu'],
      popular: true
    },
    {
      id: 'lengkap',
      name: 'Lengkap',
      subtitle: 'Semua alat, tanpa kecuali',
      price: 22000,
      oldPrice: 30000,
      saving: 8000,
      includes: ['Money Tracker', 'Study Planner', 'Course Summaries (Ringkasan Materi)'],
      popular: false
    }
  ],
  singles: [
    { id: 'money', name: 'Money Tracker', price: 9000, icon: 'wallet' },
    { id: 'planner', name: 'Study Planner', price: 9000, icon: 'cal' },
    { id: 'summaries', name: 'Course Summaries', price: 12000, icon: 'book' }
  ],
  payment: {
    whatsAppNumber: '628156002399',
    qrisImagePath: '/img/qris.png'
  }
};
