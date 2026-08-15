/**
 * Canonical bookId -> citation-map abbreviation, shared by the import
 * scripts so the two directions of the conversion agree on book names.
 *
 * The abbreviation is the Christian-system name the converter uses, e.g.
 * "1Sam" for sam1. It appears in jewish-to-christian-citation-map.json
 * values and must match how import-citation-map.ts keys the reverse map.
 */
export const citationBooks: Array<[string, string]> = [
  ['gen', 'Gen'], ['exod', 'Ex'], ['lev', 'Lev'], ['num', 'Num'], ['deut', 'Deut'], ['josh', 'Josh'], ['judg', 'Judg'], ['ruth', 'Ruth'],
  ['sam1', '1Sam'], ['sam2', '2Sam'], ['kgs1', '1Kings'], ['kgs2', '2Kings'], ['chr1', '1Chr'], ['chr2', '2Chr'], ['ezra', 'Ezra'], ['neh', 'Neh'],
  ['esth', 'Esth'], ['job', 'Job'], ['ps', 'Ps'], ['prov', 'Prov'], ['eccl', 'Eccl'], ['song', 'Song'], ['lam', 'Lam'], ['isa', 'Isa'], ['jer', 'Jer'],
  ['ezek', 'Ezek'], ['dan', 'Dan'], ['hos', 'Hos'], ['joel', 'Joel'], ['amos', 'Am'], ['obad', 'Ob'], ['jonah', 'Jon'], ['mic', 'Mic'], ['nah', 'Nah'],
  ['hab', 'Hab'], ['zeph', 'Zeph'], ['hag', 'Hag'], ['zech', 'Zech'], ['mal', 'Mal'],
] as const

export const citationAbbrevs = new Map<string, string>(citationBooks)
