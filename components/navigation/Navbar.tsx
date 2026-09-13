import Link from "next/link";
import Logo from "@/components/ui/Logo";
import ArrowIcon from "@/components/ui/ArrowIcon";

const links = [
  { href: "#about", label: "About" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#technology", label: "Technology" },
  { href: "#architecture", label: "Architecture" },
  { href: "#impact", label: "Impact" },
];

export default function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-abyss/70 backdrop-blur-sm">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Logo />
          </Link>
          <span aria-hidden className="hidden h-8 w-px bg-line sm:block" />
          <span className="hidden font-mono text-[10px] uppercase leading-tight tracking-mission text-ice sm:block">
            Navigate a
            <br />
            Safer Tomorrow
          </span>
        </div>

        <ul className="hidden items-center gap-9 font-body text-sm text-frost/90 lg:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="transition-colors hover:text-ice">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/command-center"
          className="inline-flex items-center gap-2 rounded-full border border-frost/40 px-5 py-2 font-body text-sm text-frost transition-colors hover:border-ice hover:text-ice"
        >
          Explore
          <ArrowIcon className="h-3.5 w-3.5" />
        </Link>
      </nav>
    </header>
  );
}
