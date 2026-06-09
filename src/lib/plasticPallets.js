// Customers that require shipping on plastic pallets (no fiber pallets).
// When an order for one of these ships on 1+ pallets (freight), the packing
// list shows a "Ship on Plastic Pallets Only" note.

export const PLASTIC_PALLET_NOTE = 'Ship on Plastic Pallets Only';

const PLASTIC_PALLET_CUSTOMERS = [
  'Aentep SA',
  'AGA Color Solutions',
  'AGM SRLS',
  'AMZ Ltd',
  'API.PL Sp. z o.o.',
  'APLA Amerykanskie',
  'Australian Merch Co.',
  'Bergstein',
  'CCGNZ Group Ltd',
  'Cockerill & Co',
  'Colenso Screen Services',
  'Dalesway',
  'DDS Druma BV',
  'Diseri Equipos Serigraficos y Digitales,S.A.',
  'DRK LBL',
  'Druckerie Berg',
  'Druckerie Max Gotz GmbH',
  'Ellebi snc di Luciano',
  'Ellegi SRL',
  'Embroidery Works',
  'Fahnen Gartner',
  'Farben Frikell GmbH',
  'FlyerAlarm',
  'Grec d.o.o.',
  'Groner Schulze GmbH',
  'Hi Tec Ink 2024 Limited',
  'Ing. Gesellschaft Binder',
  'Jones Brothers',
  'Juhl AS',
  'KIT',
  'Lockamp Vertriebs GmbH',
  'M Graphic Solutions, UNIP',
  'Mabasi Lab Sarl',
  'Macma Kft',
  'Macquip and Screenwise',
  'Merchout',
  'PALS Print and Screen',
  'PC Technology',
  'PF Concept UK Operations Ltd',
  'Print Equipment GmbH',
  'Pubblicarrello',
  'Publivenor',
  'Ravanetto',
  'Reagraf',
  'Rousseaux',
  'Sarv Ltd',
  'Screen Print Essentials',
  'Screen Print World Ltd',
  'Serigraf Ltd',
  'Servis Centrum',
  'Siebdruckversand',
  'Spandex AS',
  'Termotransferowy',
  'The Ink Garage',
  'UMS Production Services',
  'Uras Kimya',
  'Wakkumbura Industrial Technology',
  'Wave Dreams',
  'WDK',
  'Welle Oberkirch',
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
