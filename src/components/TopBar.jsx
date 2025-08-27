// src/components/TopBar.jsx
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { Link } from "react-router-dom";

export default function TopBar() {
  return (
    <div className="w-full bg-sandLight/70 backdrop-blur sticky top-0 z-50 border-b border-sandRing">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="h-9 w-9 rounded-xl bg-caramel text-white grid place-items-center font-bold">✓</Link>
          <div className="text-brown font-semibold">Raibā Pupa</div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/parent" className="text-brown hover:text-cocoa text-sm">Pieteikumi</Link>
          <Link to="/parent/settings" className="text-brown hover:text-cocoa text-sm">Profils</Link>
          <button
            onClick={() => signOut(auth)}
            className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown hover:bg-sand text-sm"
          >
            Iziet
          </button>
        </div>
      </div>
    </div>
  );
}
