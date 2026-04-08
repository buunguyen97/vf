import Header from './Header';

export default function Layout({ children }) {
  return (
    <div className="h-screen w-full bg-[#0A0A0A] text-white flex flex-col font-sans overflow-hidden">
      <Header />
      <main className="flex-1 w-full h-[calc(100vh-73px)] relative overflow-hidden">
        {children}
      </main>
    </div>
  );
}
