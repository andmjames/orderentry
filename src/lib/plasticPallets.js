// Customers that require shipping on plastic pallets (no fiber pallets).
// When an order for one of these ships on 1+ pallets (freight), the packing
// list shows a "Ship on Plastic Pallets Only" note.

export const PLASTIC_PALLET_NOTE = 'Ship on Plastic Pallets Only';

// Names below are the exact Zoho customer names (resolved from the customer
// list), so they match what the app reads off the selected contact.
// NOTE: three CSV entries had no match in Zoho and are kept as-is until their
// Zoho spelling is confirmed: "Farben Frikell GmbH", "FlyerAlarm",
// "Pubblicarrello".
const PLASTIC_PALLET_CUSTOMERS = [
  'Aentep S.A.',
  'AGA Color Solutions',
  'AGM srl',
  'AMZ Ltd.',
  'API.PL Sp. z o.o.',
  'APLA Amerykanskie Technologie',
  'Australian Merch Co.',
  'Bergstein BV',
  'CCGNZ Group Ltd',
  'Cockerill Global LTD',
  'Colenso Screen Services Ltd',
  'Dalesway Print Technology',
  'DDS Druma BV',
  'Equipos Serigraficos y Digitales, S.A.',
  'DRK LBL',
  'Druckerei Berg Gmbh',
  'Druckerei Max Gotz GmbH',
  'Ellebi snc di Luciano Bovolenta & C.',
  'Ellegi SRL',
  'Embroidery Works Limited',
  'Fahnen Gartner GbmH',
  'Farben Frikell GmbH',
  'FlyerAlarm',
  'Grec d.o.o.',
  'Groner Schulze GmbH',
  'Hi Tec Ink 2024 Limited',
  'Ingenieurgesellschaft Binder',
  'Jones Brothers Printechnology PTY LTD',
  'Juhl A/S',
  'Kroschewski Industrie Technik GmbH (KIT)',
  'Lockamp Vertriebs GmbH',
  'M Graphic Solutions Unip, LDA',
  'Mabasi Lab Sarl',
  'Macma Kft',
  'Macquip & Screenwise',
  'Merchout',
  'PALS Print & Screen',
  'PC Technology NV',
  'PF Concept UK Operations Ltd',
  'Print Equipment GmbH & Co. KG',
  'Pubblicarrello',
  'Publivenor',
  'Ravanetto',
  'Reagraf Lda',
  'Rousseaux',
  'Sarv Ltd.',
  'Screen Print Essentials Ltd',
  'Screen Print World Limited',
  'Serigraf Ltd.',
  'Servis Centrum a.s.',
  'Siebdruckversand',
  'Spandex AS',
  'Termotransferowy.pl Sp. z o.o.',
  'The Ink Garage',
  'UMS Production Svcs Unit Trust T/A Super Special',
  'Uras Kimya San. Tic. A.S.',
  'Wakkumbura Industrial Technology Company Pvt Ltd',
  'Wave Dreams',
  'WDK KG D. Lintner Paul',
  'Welle Oberkirch GmbH',
  'Werk5 ag',
  'Zapke Screen Printing Solutions GmbH',
  'Zeefdrukwinkel',
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const KEYS = new Set(PLASTIC_PALLET_CUSTOMERS.map(norm));

export function isPlasticPalletCustomer(name) {
  const k = norm(name);
  return !!k && KEYS.has(k);
}
