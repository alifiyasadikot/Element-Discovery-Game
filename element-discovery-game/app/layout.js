import './globals.css';
import Nav from '@/components/Nav';

export const metadata = { title: 'Element Discovery', description: 'Combine elements, discover new ones, battle other players.' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
