"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/timesheet", label: "勤務表", icon: "📅" },
  { href: "/payslips", label: "給与明細", icon: "💰" },
  { href: "/notices", label: "お知らせ", icon: "🔔" },
];

export function EmployeeNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white">
      <div className="mx-auto grid max-w-lg grid-cols-3">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-xs ${
                active ? "font-semibold text-blue-600" : "text-gray-500"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
