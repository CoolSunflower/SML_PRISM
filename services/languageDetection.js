/**
 * Language Detection Service
 *
 * Uses franc (ESM-only, loaded dynamically) to detect text language.
 * Returns ISO 639-3 (3-letter) codes from franc, mapped to ISO 639-1 (2-letter)
 * codes needed by the translator service.
 *
 * Reusable by kwatchQueue.js, googleAlertsService.js, and any future ingestion paths.
 */

// franc is ESM-only, must be loaded with dynamic import()
let franc = null;

// ISO 639-3 (franc output) -> ISO 639-1 (translator input) for all supported languages
const ISO3_TO_ISO1 = {
  por: 'pt', jpn: 'ja', spa: 'es', ind: 'id', ara: 'ar',
  deu: 'de', slv: 'sl', ita: 'it', cat: 'ca', pol: 'pl',
  fra: 'fr', swe: 'sv', tgl: 'tl', dan: 'da', zho: 'zh',
  lit: 'lt', nld: 'nl', est: 'et', tha: 'th', fin: 'fi',
  tur: 'tr', ron: 'ro', kor: 'ko', eng: 'en',
};

const SUPPORTED_ISO1 = new Set(Object.values(ISO3_TO_ISO1));

/**
 * Initialize the franc language detection library.
 * Must be called once before detectLanguage().
 */
async function initialize() {
  if (!franc) {
    try {
      const francModule = await import('franc');
      franc = francModule.franc;
      console.log('[LanguageDetection] franc loaded');
    } catch (err) {
      console.error('[LanguageDetection] Failed to load franc:', err.message);
    }
  }
}

/**
 * Detect the language of the given text.
 *
 * @param {string} text - Text to detect (needs ~20+ chars for reliability)
 * @returns {{ iso3: string|null, iso1: string|null, isEnglish: boolean, isSupported: boolean }}
 */
function detectLanguage(text) {
  if (!franc || !text || text.trim().length < 10) {
    return { iso3: null, iso1: null, isEnglish: false, isSupported: false };
  }

  try {
    const iso3 = franc(text, { minLength: 10 });

    if (iso3 === 'und') {
      return { iso3: 'und', iso1: null, isEnglish: false, isSupported: false };
    }

    const iso1 = ISO3_TO_ISO1[iso3] || null;
    return {
      iso3,
      iso1,
      isEnglish: iso3 === 'eng',
      isSupported: iso1 !== null && SUPPORTED_ISO1.has(iso1),
    };
  } catch (err) {
    console.warn('[LanguageDetection] Detection error:', err.message);
    return { iso3: null, iso1: null, isEnglish: false, isSupported: false };
  }
}

module.exports = { initialize, detectLanguage };
