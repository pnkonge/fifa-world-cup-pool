/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHEET_CSV_RESULTS?: string;
  readonly VITE_SHEET_CSV_SCORING?: string;
  readonly VITE_SHEET_CSV_STANDINGS?: string;
  readonly VITE_SHEET_CSV_SCHEDULE?: string;
  readonly VITE_SHEET_CSV_PREDICTIONS_GROUP?: string;
  readonly VITE_SHEET_CSV_PREDICTIONS_KO?: string;
  readonly VITE_FORM_1_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
