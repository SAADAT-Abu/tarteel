import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tarteel — Virtual Taraweeh",
  description: "Pray Taraweeh together, wherever you are. Live synchronized rooms with Muslims worldwide.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-mosque-dark text-white antialiased">
        {children}
      </body>
    </html>
  );
}
