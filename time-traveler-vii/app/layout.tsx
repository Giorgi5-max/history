import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'დროის მოგზაური — საქართველოს ისტორია VII',description:'იმოგზაურე საქართველოს წარსულში: 6 თავი, 25 გაკვეთილი, თამაშები და აღმოჩენები.',icons:{icon:'/favicon.svg'},manifest:'/manifest.webmanifest'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ka"><body>{children}</body></html>}
