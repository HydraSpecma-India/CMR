/**
 * Second language printed on the CMR form next to English (bilingual forms are the norm for
 * CMR consignment notes). Client-safe.
 *
 * Danish and Swedish wording follows the common Scandinavian CMR forms ("fragtbrev" /
 * "fraktsedel"). Have logistics in DK/SE confirm the wording before first live use.
 */
import { BOXES, CMR_COPIES, GOODS, type GoodsColumnKey } from "./layout";

export type FormLang = "de" | "da" | "sv";

export const FORM_LANGUAGES: { code: FormLang; label: string; country: string[] }[] = [
  { code: "de", label: "English / German (Deutsch)", country: ["DEU", "DE", "AUT", "AT", "CHE", "CH"] },
  { code: "da", label: "English / Danish (Dansk)", country: ["DNK", "DK"] },
  { code: "sv", label: "English / Swedish (Svenska)", country: ["SWE", "SE"] },
];

export const isFormLang = (v: unknown): v is FormLang => v === "de" || v === "da" || v === "sv";

/** Default form language for a sender country (ISO2/ISO3), falling back to German. */
export function langForCountry(country?: string | null): FormLang {
  const c = (country || "").toUpperCase();
  return FORM_LANGUAGES.find((l) => l.country.includes(c))?.code ?? "de";
}

export interface FormTexts {
  subtitle: string;
  copies: [string, string, string, string];
  boxes: Record<string, string>;
  goods: Record<GoodsColumnKey, string>;
  carriagePaid: string;
  carriageForward: string;
  payHead: [string, string, string];
  payRows: [string, string, string, string, string, string];
  on: string;
  place: string;
  date: string;
  total: string;
  adrClass: string;
  adrUn: string;
  adrLetter: string;
  adrDescription: string;
  continuation: string;
  sender: string;
  consignee: string;
  /** left margin – who fills which boxes */
  marginLeft: string;
  /** right margin – ADR note */
  marginRight: string;
}

export const MARGIN_EN = {
  left: "To be completed on the sender's responsibility: boxes 1–15 and 19–22  ·  The spaces framed with bold lines (16–18, 23) are completed by the carrier",
  right: "In case of dangerous goods mention, besides the possible certification, on the last line of the column the particulars of the class, the UN number and the letter, if any (ADR)",
};

const de: FormTexts = {
  subtitle: "Internationaler Frachtbrief",
  copies: CMR_COPIES.map((c) => c.de) as unknown as FormTexts["copies"],
  boxes: Object.fromEntries(BOXES.map((b) => [b.no, b.de])),
  goods: Object.fromEntries(GOODS.columns.map((c) => [c.key, c.de])) as FormTexts["goods"],
  carriagePaid: "Frei",
  carriageForward: "Unfrei",
  payHead: ["Absender", "Währung", "Empfänger"],
  payRows: ["Fracht", "Ermäßigungen", "Zwischensumme", "Zuschläge", "Sonstiges", "Gesamtsumme"],
  on: "am",
  place: "Ort",
  date: "Datum",
  total: "Summe",
  adrClass: "Klasse",
  adrUn: "UN-Nr.",
  adrLetter: "Ziffer",
  adrDescription: "Bezeichnung",
  continuation: "Fortsetzungsblatt",
  sender: "Absender",
  consignee: "Empfänger",
  marginLeft: "Vom Absender auszufüllen: Felder 1–15 und 19–22  ·  Die stark umrandeten Felder (16–18, 23) füllt der Frachtführer aus",
  marginRight: "Bei gefährlichen Gütern sind, außer der eventuellen Bescheinigung, in der letzten Zeile der Rubrik anzugeben: Klasse, UN-Nummer und gegebenenfalls Buchstabe (ADR)",
};

const da: FormTexts = {
  subtitle: "Internationalt fragtbrev",
  copies: ["Afsenderens eksemplar", "Modtagerens eksemplar", "Fragtførerens eksemplar", "Administrativt eksemplar"],
  boxes: {
    "1": "Afsender (navn, adresse, land)",
    "2": "Modtager (navn, adresse, land)",
    "3": "Leveringssted for godset (sted, land)",
    "4": "Sted og dato for godsets overtagelse (sted, land, dato)",
    "5": "Vedlagte dokumenter",
    "13": "Afsenderens instruktioner (told og andre formaliteter)",
    "14": "Instruktioner vedrørende betaling af fragt",
    "15": "Efterkrav",
    "16": "Fragtfører (navn, adresse, land)",
    "17": "Efterfølgende fragtførere (navn, adresse, land)",
    "18": "Fragtførerens forbehold og bemærkninger",
    "19": "Særlige aftaler",
    "20": "Betales af",
    "21": "Udstedt i",
    "22": "Afsenderens underskrift og stempel",
    "23": "Fragtførerens underskrift og stempel",
    "24": "Gods modtaget – modtagerens underskrift og stempel",
  },
  goods: {
    Marks: "Mærker og numre",
    Packages: "Antal kolli",
    Packing: "Emballagens art",
    Nature: "Godsets art",
    StatNo: "Statistisk nummer",
    GrossWeight: "Bruttovægt i kg",
    Volume: "Rumfang i m³",
  },
  carriagePaid: "Franko",
  carriageForward: "Ufranko",
  payHead: ["Afsender", "Valuta", "Modtager"],
  payRows: ["Fragt", "Fradrag", "Saldo", "Tillæg", "Andre gebyrer", "I alt"],
  on: "den",
  place: "Sted",
  date: "Dato",
  total: "I alt",
  adrClass: "Klasse",
  adrUn: "UN-nr.",
  adrLetter: "Bogstav",
  adrDescription: "Beskrivelse",
  continuation: "Fortsættelsesark",
  sender: "Afsender",
  consignee: "Modtager",
  marginLeft: "Udfyldes på afsenderens ansvar: felt 1–15 og 19–22  ·  Felterne med fed ramme (16–18, 23) udfyldes af fragtføreren",
  marginRight: "Ved farligt gods angives, ud over eventuel certificering, på kolonnens sidste linje klasse, UN-nummer og eventuelt bogstav (ADR)",
};

const sv: FormTexts = {
  subtitle: "Internationell fraktsedel",
  copies: ["Avsändarens exemplar", "Mottagarens exemplar", "Fraktförarens exemplar", "Administrativt exemplar"],
  boxes: {
    "1": "Avsändare (namn, adress, land)",
    "2": "Mottagare (namn, adress, land)",
    "3": "Leveransort för godset (ort, land)",
    "4": "Ort och datum för godsets övertagande (ort, land, datum)",
    "5": "Bifogade dokument",
    "13": "Avsändarens instruktioner (tull och andra formaliteter)",
    "14": "Instruktioner om betalning av frakt",
    "15": "Efterkrav",
    "16": "Fraktförare (namn, adress, land)",
    "17": "Efterföljande fraktförare (namn, adress, land)",
    "18": "Fraktförarens förbehåll och anmärkningar",
    "19": "Särskilda överenskommelser",
    "20": "Betalas av",
    "21": "Utfärdad i",
    "22": "Avsändarens underskrift och stämpel",
    "23": "Fraktförarens underskrift och stämpel",
    "24": "Godset mottaget – mottagarens underskrift och stämpel",
  },
  goods: {
    Marks: "Märken och nummer",
    Packages: "Antal kollin",
    Packing: "Förpackningssätt",
    Nature: "Varuslag",
    StatNo: "Statistiskt nummer",
    GrossWeight: "Bruttovikt i kg",
    Volume: "Volym i m³",
  },
  carriagePaid: "Fraktfritt",
  carriageForward: "Ofranko",
  payHead: ["Avsändare", "Valuta", "Mottagare"],
  payRows: ["Frakt", "Avdrag", "Saldo", "Tillägg", "Övriga avgifter", "Totalt"],
  on: "den",
  place: "Ort",
  date: "Datum",
  total: "Summa",
  adrClass: "Klass",
  adrUn: "UN-nr",
  adrLetter: "Bokstav",
  adrDescription: "Beskrivning",
  continuation: "Fortsättningsblad",
  sender: "Avsändare",
  consignee: "Mottagare",
  marginLeft: "Ifylls på avsändarens ansvar: fält 1–15 och 19–22  ·  Fälten med fet ram (16–18, 23) ifylls av fraktföraren",
  marginRight: "Vid farligt gods anges, utöver eventuellt intyg, på kolumnens sista rad klass, UN-nummer och i förekommande fall bokstav (ADR)",
};

const TEXTS: Record<FormLang, FormTexts> = { de, da, sv };

export const formTexts = (lang?: string | null): FormTexts => TEXTS[isFormLang(lang) ? lang : "de"];
