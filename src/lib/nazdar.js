// Nazdar-specific packing-list content. Shared by the on-screen/print packing
// list (PackingList.js) and the attached PDF (packingPdf.js) so they stay in sync.
// Applies only when the customer is Nazdar.

export function isNazdar(name) {
  return /nazdar/i.test(String(name || ''));
}

export function isImageTech(name) {
  return /image\s*tech/i.test(String(name || ''));
}

// Image Technology: boxed "Do Not Stack" cone/label note.
export const IMAGE_TECH = {
  noteLines: [
    'Apply a "Do Not Stack" Cone to the top of each Pallet',
    '&',
    'Apply a "Do Not Stack" Label to the side of each Pallet',
  ],
};

export const NAZDAR = {
  doNotStack: 'Use DO NOT STACK Cones on all Pallet Shipments to Nazdar',

  barcodesTitle: 'Nazdar Barcodes Applied',
  lotNote: 'Different lot numbers are separated by vertical cardboard sheets.',
  skidLine: 'Skid # ________   contains __________ cases of item # _______________________   from lot # ________________',
  skidRows: 8,

  originTitle: 'Certificate of Origin',
  originBody: 'We hereby certify that all items on this packing list are manufactured in the United States of America.',
  originLocation: 'Manufacturing Location: 525 Herriman Ct Noblesville, IN 46060 USA',

  analysisTitle: 'Certificate of Analysis',
  analysisIntro: 'The products listed above were manufactured and inspected in accordance with PMI Tape quality standards.',
  analysisBody: 'OSHA Status: This product is considered an article under OSHA criteria. CERCLA Reportable Quantity: This product is not reportable under CERCLA. Section 302 Extremely Hazardous Substances: This product does not contain any extremely hazardous substance as defined and listed in Section 302. Section 311/312 Hazardous Categories: This product is not reportable as a hazardous substance. Section 313 Toxic Chemicals: This product contains no toxic chemical above the de minimis levels. Cas No 98-86-2: This product contains no Acetophenone. Cas No 617-94-7: This product contains no 2-Phenyl-2-Propanol. CONEG Heavy Metals: This product does not contain Lead, Mercury, Cadmium, or hexavalent Chromium above the levels regulated by the CONEG model legislation. TSCA Inventory: All ingredients are listed in the TSCA inventory or are exempt from listing. Clean Air Ozone Depleting Chemicals: This product was not manufactured using Class I or Class II Ozone Depleting Chemicals. Alkylphenol (AP) and Alkylphenol Ethoxylates (APEOs): This product contains no Nonylphenol (NP), Octylphenol (OP), Nonylphenol Ethoxylates (NPEOs), Octylphenol Ethoxylates (OPEOs), Alkylphenol (AP) or Alkylphenol Ethoxylates (APEOs). DEHP/Phthalates: This product contains no DEHPs or Phthalates. Skin Contact: This product is FDA approved for direct skin contact.',

  signLabel: 'Authorized Signature:',
  signName: 'Andrew James',
  signTitle: 'President',
  signCompany: 'PMI Tape',
};
