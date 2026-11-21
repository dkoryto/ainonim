// The printable report of the masking log, opened from the "Dziennik" tab; drawn by
// lib/pages/report.ts, then printed by the browser, where the user can save it as PDF.
import { showReport } from '~/lib/pages/report';

const root = document.getElementById('report');
if (root) {
  void showReport(root, () => {
    window.print();
  });
}
