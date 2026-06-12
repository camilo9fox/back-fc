/**
 * Local content safety patterns for Spanish and English.
 * Category severity: 1 (mild) to 5 (extreme / always blocked).
 *
 * In moderate mode, patterns with severity >= 4 are blocked.
 * In strict mode, patterns with severity >= 2 are blocked.
 *
 * Compound categories (hate_speech_targeted): require two conditions
 * to be met simultaneously — a protected group mention AND a contempt
 * indicator within the same text.
 */

const CONTEMPT_TERMS = [
  /\bpelotud[oa]s?\b/i,
  /\bbolud[oa]s?\b/i,
  /\bforr[oa]s?\b/i,
  /\bconchud[oa]s?\b/i,
  /\bgilipollas\b/i,
  /\bcapullos?\b/i,
  /\bmam[oó]n(?:es)?\b/i,
  /\bimb[eé]cil(?:es)?\b/i,
  /\best[uú]pid[oa]s?\b/i,
  /\btarad[oa]s?\b/i,
  /\bretrasad[oa]s?\b/i,
  /\bmog[oó]lic[oa]s?\b/i,
  /\bsubnormal(?:es)?\b/i,
  /\basqueros[oa]s?\b/i,
  /\brepugnantes?\b/i,
  /\bdespreciables?\b/i,
  /\binferiores?\b/i,
  /\bescoria\b/i,
  /\blacra\b/i,
  /\bplaga\b/i,
  /\bdegenerad[oa]s?\b/i,
  /\bson\s+una\s+(?:desgracia|verg[uü]enza|peste)\b/i,
  /\bdeber[ií]an\s+(?:morir|desaparecer|extinguirse)\b/i,
  /\bno\s+(?:merecen|deber[ií]an)\s+(?:vivir|existir)\b/i,
  /\b(?:hay|deber[ií]an)\s+(?:que\s+)?(?:matar|eliminar|exterminar)\b/i,
  /\bno\s+son\s+(?:personas|humanos|gente|normales)\b/i,
  /\b(?:asco|asco\s+de)\b/i,
  /\b(?:son|es)\s+(?:un[aos]?\s+)?(?:asco|basura|porquer[ií]a|mierda|desastre)\b/i,
];

const PROTECTED_GROUPS = [
  /\bhomosexual(?:es)?\b/i,
  /\bgays?\b/i,
  /\blesbianas?\b/i,
  /\btrans(?:sexual(?:es)?|g[eé]ner[oa])?\b/i,
  /\bnegros?\b/i,
  /\bjud[ií]os?\b/i,
  /\bmusulman(?:es)?\b/i,
  /\binmigrantes?\b/i,
  /\bind[ií]genas?\b/i,
  /\bdiscapacitad[oa]s?\b/i,
  /\bcristianos?\b/i,
  /\bbisexual(?:es)?\b/i,
  /\bpansexual(?:es)?\b/i,
  /\basi[aá]tic[oa]s?\b/i,
  /\blatin[oa]s?\b/i,
  /\bhispan[oa]s?\b/i,
  /\b[aá]rabes?\b/i,
  /\bchin[oa]s?\b/i,
  /\bgitan[oa]s?\b/i,
  /\brefugiad[oa]s?\b/i,
  /\bdesplazad[oa]s?\b/i,
];

const PATTERNS = {
  profanity: {
    severity: 4,
    patterns: [
      /\bcabr[oó]n\b/i,
      /\bchinga(r|da|d[ao]|zo|n)?\b/i,
      /\bput[ao]\b/i,
      /\bpinche\b/i,
      /\bmierda\b/i,
      /\bjoder\b/i,
      /\bcojo(?:nes|nudo|nuda)\b/i,
      /\bverga\b/i,
      /\bhuev(?:[oó]n|ada)\b/i,
      /\bcul[eo]r[oa]?\b/i,
      /\bmaric[oó]n\b/i,
      /\bpendej[oa]\b/i,
      /\bpelotud[oa]s?\b/i,
      /\bbolud[oa]s?\b/i,
      /\bforr[oa]s?\b/i,
      /\bconchud[oa]s?\b/i,
      /\bgilipollas\b/i,
      /\bcapullos?\b/i,
      /\bmam[oó]n(?:es)?\b/i,
      /\btortiller[oa]s?\b/i,
      /\btravel[oa]s?\b/i,
      /\bmarica\b/i,
      /\bsodomita\b/i,
      /\bimb[eé]cil(?:es)?\b/i,
      /\best[uú]pid[oa]s?\b/i,
      /\btarad[oa]s?\b/i,
      /\bretrasad[oa]s?\b/i,
      /\bmog[oó]lic[oa]s?\b/i,
      /\bsubnormal(?:es)?\b/i,
      /\bculiad[oa]s?\b/i,
      /\bcag[oó]n(?:es)?\b/i,
      /\basshole\b/i,
      /\b[ck]unt\b/i,
      /\bfuck(?:er|ing|ed)?\b/i,
      /\bshit(?:ty|head|hole)?\b/i,
      /\bbitch(?:es)?\b/i,
      /\bbastard[oa]?\b/i,
      /\bdick\b/i,
      /\bpussy\b/i,
      /\bwhore\b/i,
      /\bslut\b/i,
    ],
  },

  slurs: {
    severity: 5,
    patterns: [
      /\bsudaca\b/i,
      /\bpanchitos?\b/i,
      /\bmachupichu\b/i,
      /\bchileno\b.*\btraidor\b/i,
      /\btraidor\b.*\bchileno\b/i,
      /\bnegr[oa]s?\s+(?:de\s+)?mierda\b/i,
      /\bjud[ií][oa]s?\s+(?:de\s+)?mierda\b/i,
      /\bmaric[oó]n(?:es)?\s+(?:de\s+)?mierda\b/i,
      /\bmor[oa]s?\s+(?:de\s+)?mierda\b/i,
      /\bt[ií]tere\s+(?:de\s+)?(?:los\s+)?(?:jud[ií]os|sionistas)\b/i,
      /\bconspiraci[oó]n\s+(?:jud[ií]a|sionista)\b/i,
      /\b(?:tiraflechas|comeperros?)\b/i,
    ],
  },

  hate_speech: {
    severity: 5,
    patterns: [
      /\b(nazi|nazis)\b/i,
      /\b(?:muerte|mata[rnd]?|a\s+la\s+horca|linch)\s+(?:a\s+(?:los|las)\s+)?(?:negros|jud[ií]os|gays|mujeres|ind[ií]genas|inmigrantes|musulmanes|cristianos|homosexuales|trans)\b/i,
      /\bgenocidio\b/i,
      /\bsupremac[ií]a\s+(?:blanca|racial)\b/i,
      /\bk[lk]{2}\b/i,
      /\bwhite\s+(?:power|supremacy)\b/i,
      /\bhitler\b/i,
      /\bheil\b/i,
      /\blimpieza\s+(?:[eé]tnica|racial)\b/i,
      /\binferior(?:es)?\s+(?:por\s+)?(?:raza|color|origen)\b/i,
    ],
  },

  hate_speech_targeted: {
    severity: 5,
    compound: true,
  },

  sexual_minors: {
    severity: 5,
    patterns: [
      /\bped[oó]fil[oa]\b/i,
      /\bchild\s*porn/i,
      /\bpornograf[ií]a\s+infantil\b/i,
      /\babuso\s+(?:sexual\s+)?(?:infantil|de\s+menores)\b/i,
      /\b(?:sexual|desnud[oa]|er[oó]tic[oa]|pornogr[aá]fic[oa])\b.*\b(?:menor|niñ[oa]|niñ[oa]s|infantil|adolescente|niñez|menores|beb[eé])\b/i,
      /\b(?:menor|niñ[oa]|niñ[oa]s|infantil|adolescente|niñez|menores|beb[eé])\b.*\b(?:sexual|desnud[oa]|er[oó]tic[oa]|pornogr[aá]fic[oa])\b/i,
    ],
  },

  self_harm: {
    severity: 4,
    contextual: true,
    contextExclusion: /\b(?:psicolog|psiquiatr|clinic|tratamiento|terap|paciente|diagnostic|medic|hospital|prevenci[oó]n|intervenci[oó]n|salud\s+mental)\b/i,
    patterns: [
      /\bsuicid(?:io|a[rst]e?|arme)\b/i,
      /\bautolesi[oó]n\b/i,
      /\bc[oó]mo\s+suicidarse\b/i,
      /\bm[eé]todos?\s+(?:para|de)\s+suicidio\b/i,
      /\bk[yi]ll\s+(?:your|my)self\b/i,
      /\bquitarse\s+la\s+vida\b.*\b(?:c[oó]mo|m[eé]todo|forma|pasos?)\b/i,
    ],
  },

  violence_graphic: {
    severity: 4,
    patterns: [
      /\btortur[ao]\b/i,
      /\bdescuartiz[ao]\b/i,
      /\bdecapit[ao]\b/i,
      /\bmutil[ao]\b/i,
      /\bviol(?:aci[oó]n|ar|ada)\s+sexual\b/i,
      /\bexplot(?:ar|aci[oó]n)\s+(?:sexual|infantil)\b/i,
      /\btrata\s+de\s+(?:personas|blancas|menores|niñ[oa]s)\b/i,
    ],
  },

  terrorism: {
    severity: 5,
    patterns: [
      /\b(?:c[oó]mo|instrucciones?|manual|gu[ií]a|receta)\s+(?:para\s+)?(?:fabricar|hacer|preparar|construir)\s+(?:bombas?|explosivos?|detonadores?)\b/i,
      /\b(?:amenaza|atentado|ataque)\s+terrorista\b/i,
      /\bhow\s+to\s+(?:make|build|create)\s+(?:a\s+)?bomb\b/i,
    ],
  },

  drugs_hard: {
    severity: 3,
    patterns: [
      /\b(?:c[oó]mo|instrucciones?|manual|gu[ií]a)\s+(?:para\s+)?(?:fabricar|producir|sintetizar)\s+(?:metanfetamina|coca[ií]na|hero[ií]na|fentanilo)\b/i,
      /\bd[oó]nde\s+comprar\s+(?:drogas?|metanfetamina|coca[ií]na|hero[ií]na)\b/i,
    ],
  },
};

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if text matches a compound pattern — requires BOTH a protected
 * group mention AND a contempt indicator in the same text.
 */
function checkCompoundHateSpeech(text) {
  const hasGroup = PROTECTED_GROUPS.some((pattern) => pattern.test(text));
  if (!hasGroup) return false;

  const hasContempt = CONTEMPT_TERMS.some((pattern) => pattern.test(text));
  return hasContempt;
}

/**
 * Check text against local patterns.
 * @param {string} text
 * @param {'moderate'|'strict'} mode
 * @returns {{ safe: boolean, flagged: string[] }} - flagged categories
 */
function checkLocalPatterns(text, mode = "moderate") {
  const minSeverity = mode === "strict" ? 2 : 4;
  const normalized = normalizeText(text);
  const flagged = [];

  for (const [category, config] of Object.entries(PATTERNS)) {
    if (config.severity < minSeverity) continue;

    if (config.compound) {
      if (checkCompoundHateSpeech(normalized)) {
        flagged.push(category);
      }
      continue;
    }

    for (const pattern of config.patterns) {
      if (pattern.test(normalized)) {
        // Contextual exclusion for self_harm: allow in clinical/medical contexts
        if (category === "self_harm" && config.contextExclusion && config.contextExclusion.test(normalized)) {
          continue;
        }
        flagged.push(category);
        break;
      }
    }
  }

  return {
    safe: flagged.length === 0,
    flagged,
  };
}

module.exports = { PATTERNS, checkLocalPatterns, normalizeText, PROTECTED_GROUPS, CONTEMPT_TERMS, checkCompoundHateSpeech };
