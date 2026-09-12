import Link from "next/link";
import Logo from "@/components/ui/Logo";

const links = [
  { href: "#mission", label: "Mission" },
  { href: "#intelligence", label: "Intelligence" },
  { href: "#access", label: "Access" },
];

export default function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-abyss/70 backdrop-blur-sm">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-8 font-mono text-xs uppercase tracking-mission text-mist sm:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="transition-colors hover:text-ice"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
