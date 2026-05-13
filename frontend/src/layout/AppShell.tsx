import { ReactNode, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Toast } from "@heroui/react";
import Topbar from "./Topbar";
import OnboardingModal from "../components/OnboardingModal";
import { showBlockedNavigationToast } from "../lib/blockedNavigationToast";

export default function AppShell({ children }: { children: ReactNode }) {
  const lastToastTokenRef = useRef<string>("");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const st: any = location.state;
    if (st?.reason && typeof st.reason === "string") {
      const token = `${location.key}|${location.pathname}|${st.reason}`;
      if (lastToastTokenRef.current !== token) {
        lastToastTokenRef.current = token;
        showBlockedNavigationToast(st.reason);
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  return (
    <div className="app app--drawerOnly">
      <div className="appAmbient">
        <div className="appAmbientOrb appAmbientOrb--one" />
        <div className="appAmbientOrb appAmbientOrb--two" />
        <div className="appAmbientGrid" />
      </div>
      <OnboardingModal />
      <Toast.Provider placement="bottom" />
      <Topbar />
      <main className="appMain">
        <div className="appMainScroll">
          <div className="container">
            <div key={location.pathname} className="pageMotion pageMotion--enter">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
