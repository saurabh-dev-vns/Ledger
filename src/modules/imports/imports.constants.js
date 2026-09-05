// Category used for bulk-imported historical spending. Kept out of
// expenses.CATEGORIES so it never shows up in the manual "Add expense"
// form — it's only ever set by the import flow.
const IMPORTED_CATEGORY = 'Imported (Historical)';

module.exports = { IMPORTED_CATEGORY };
