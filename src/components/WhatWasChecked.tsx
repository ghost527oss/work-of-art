// @node: F6.10
// What was and was not checked (a closed details block). Props only.
import { whatWasChecked } from '../engine/scanView';
import type { ScanResult } from '../engine/scanFindingTypes';
import { areaLabel } from '../store/shellView';

export function WhatWasChecked({ result }: { result: ScanResult }) {
  const w = whatWasChecked(result);
  return (
    <details>
      <summary>What was and was not checked</summary>
      <ul>
        <li>Files scanned: {w.filesScanned}. Files not read: {w.filesNotRead}.</li>
        {w.couldNotCheck > 0 && <li>Could not be checked: {w.couldNotCheck} file and check pairs.</li>}
        {w.codeNotCheckedLines.map((l) => <li key={l}>{l}</li>)}
        {w.notChecked.map(([ext, n]) => <li key={ext}>.{ext}: {n} files, no checks for this type.</li>)}
        {w.notCheckedLines.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <div className="table-scroll"><table>
        <thead><tr><th scope="col">Check</th><th scope="col">Area</th><th scope="col">Fix</th></tr></thead>
        <tbody>{w.checks.map((c) => <tr key={c.id}><td>{c.title}</td><td>{areaLabel(c.area)}</td><td>{c.fix}</td></tr>)}</tbody>
      </table></div>
    </details>
  );
}
