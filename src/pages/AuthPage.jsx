import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

function mapError(e) {
  const code = e?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Nepareizs e-pasta formāts.';
    case 'auth/user-disabled':
      return 'Konts ir atspējots.';
    case 'auth/user-not-found':
      return 'Lietotājs nav atrasts.';
    case 'auth/wrong-password':
      return 'Nepareiza parole.';
    case 'auth/email-already-in-use':
      return 'Šis e-pasts jau ir reģistrēts.';
    case 'auth/weak-password':
      return 'Parole par vāju (min. 6 rakstzīmes).';
    case 'auth/popup-closed-by-user':
      return 'Pieteikšanās logs tika aizvērts.';
    case 'auth/operation-not-allowed':
      return 'Pieteikšanās metode nav atļauta (pārbaudiet Provider iestatījumus).';
    case 'auth/network-request-failed':
      return 'Tīkla kļūda. Pārbaudiet internetu.';
    default:
      return e?.message || 'Radās kļūda. Lūdzu mēģini vēlreiz.';
  }
}

export default function AuthPage() {
  const { loading } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('login'); // "login" | "signup"
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function doLoginEmail(e) {
    e?.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      nav('/', { replace: true });
    } catch (e) {
      console.error('loginEmail error:', e);
      setErr(mapError(e));
    } finally {
      setBusy(false);
    }
  }

  async function doSignupEmail(e) {
    e?.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
      nav('/', { replace: true });
    } catch (e) {
      console.error('signupEmail error:', e);
      setErr(mapError(e));
    } finally {
      setBusy(false);
    }
  }

  async function loginWith(provider) {
    setErr('');
    setBusy(true);
    try {
      await signInWithPopup(auth, provider);
      nav('/', { replace: true });
    } catch (e) {
      // Safari/Firefox u.c. popup bloķētāji → mēģinām redirect
      if (
        e?.code === 'auth/popup-blocked' ||
        e?.code === 'auth/popup-closed-by-user'
      ) {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (e2) {
          console.error('redirect error:', e2);
          setErr(mapError(e2));
        }
      } else {
        console.error('social login error:', e);
        setErr(mapError(e));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-sand flex items-center justify-center p-6">
        <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-8 text-brown">
          Ielāde…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-6">
        <h1 className="text-2xl font-semibold text-brown mb-2">
          {mode === 'login' ? 'Ienākt' : 'Reģistrēties'}
        </h1>
        <p className="text-brown/70 mb-4">Lūdzu autorizējies, lai turpinātu.</p>

        {err && <div className="text-red-600 text-sm mb-3">{err}</div>}

        <form
          onSubmit={mode === 'login' ? doLoginEmail : doSignupEmail}
          className="grid gap-3"
        >
          <input
            type="email"
            className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
            placeholder="E-pasts"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
            placeholder="Parole"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            required
          />

          <button
            type="submit"
            disabled={busy}
            className="rounded-2xl bg-caramel px-4 py-3 font-semibold text-white shadow hover:bg-cocoa disabled:opacity-50"
          >
            {mode === 'login' ? 'Ienākt' : 'Reģistrēties'}
          </button>
        </form>

        <div className="h-px bg-sandBorder my-4" />

        <div className="grid gap-2">
          <button
            onClick={() => loginWith(new GoogleAuthProvider())}
            disabled={busy}
            className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown hover:bg-sand disabled:opacity-50"
          >
            Turpināt ar Google
          </button>
          <button
            onClick={() => loginWith(new FacebookAuthProvider())}
            disabled={busy}
            className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown hover:bg-sand disabled:opacity-50"
          >
            Turpināt ar Facebook
          </button>
        </div>

        <div className="text-sm text-brown/70 mt-4">
          {mode === 'login' ? (
            <>
              Nav konta?{' '}
              <button
                onClick={() => setMode('signup')}
                className="underline hover:text-brown"
              >
                Reģistrējies
              </button>
            </>
          ) : (
            <>
              Jau ir konts?{' '}
              <button
                onClick={() => setMode('login')}
                className="underline hover:text-brown"
              >
                Ienākt
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
