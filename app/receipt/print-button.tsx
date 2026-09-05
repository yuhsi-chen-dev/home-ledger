"use client";

// ponytail: 唯一的 client component，只為了叫瀏覽器的列印／存 PDF。
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-600"
    >
      🖨 列印／存 PDF
    </button>
  );
}
