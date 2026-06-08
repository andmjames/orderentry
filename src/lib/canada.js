// Canada-shipment customs content: the packing-list customs box and the
// USMCA Certificate of Origin. Used when an order ships to Canada.

export function isCanadaCountry(country) {
  const c = String(country || '').trim();
  return /canada/i.test(c) || /^ca$/i.test(c);
}

function yy(d) { return String(d.getFullYear()).slice(-2); }

export function blanketPeriod(d = new Date()) {
  const y = yy(d);
  return { from: `01/01/${y}`, to: `12/31/${y}` };
}

export function todayMDY(d = new Date()) {
  return `${d.getMonth() + 1}/${d.getDate()}/${yy(d)}`;
}

// PMI's party block (certifier / exporter / producer on the USMCA form).
export const PMI_PARTY = [
  'Packaging Materials, Inc.',
  '525 Herriman Court',
  'Noblesville, IN 46060',
  'Telephone: +1(317)773-8915',
  'Email Address: customerservice@pmitape.com',
  'Tax Identification Number: 35-1809130',
];

// Customs box shown on the Canada packing list.
export const CUSTOMS_BOX = {
  doNotRemove: '"Customs Documents - Do Not Remove"',
  certify: '"I certify that the goods referenced in this invoice/sales contract comply with origin requirements specified for these goods in the USMCA, and that further processing or assembly in a third country has not occurred subsequent to processing or assembly in the USMCA Region"',
};

// USMCA Certificate of Origin static content.
export const USMCA = {
  title1: 'UNITED STATES-MEXICO-CANADA FREE TRADE AGREEMENT (USMCA)',
  title2: 'CERTIFICATE OF ORIGIN',
  tariff: '3919.10',
  originCriterion: 'C',
  countryOfOrigin: 'USA',
  accumulation: 'No',
  laborValue: 'No',
  singleShipment: 'Yes',
  certifyTitle: 'I CERTIFY THAT:',
  certifyText: [
    'The Information on this document is true and accurate and I assume the responsibility for proving such representations. I understand that I am liable for any false statements or material omissions made on or in connection with this document;',
    'I agree to maintain, and present upon request, documentation necessary to support this certification.',
    'The goods originated or are considered to have originated in the territory of one or more of the parties, and comply with the origin requirements specified for those goods in the United States-Mexico-Canada Free Trade Agreement; there has been no further production or any other operation outside the territories of the parties, other than unloading, reloading, or any other operation necessary to preserve the goods in good condition or to transport the goods to the territories of the parties; the goods remained under the control of the customs authorities while in the territory of a non-party; and',
    'I also agree to notify any party provided with this certificate of any changes that might adversely impact a certification previously given.',
    'This certification consists of 1 pages, including all attachments.',
  ],
  company: 'Packaging Materials, Inc.',
  name: 'Andrew James',
  titleField: 'Vice President',
  telephone: '317-773-8915',
  fax: '317-773-9219',
};
