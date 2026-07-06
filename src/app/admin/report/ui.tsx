"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-blue-600 px-4 py-1.5 font-medium text-white hover:bg-blue-700"
    >
      印刷 / PDF保存
    </button>
  );
}
