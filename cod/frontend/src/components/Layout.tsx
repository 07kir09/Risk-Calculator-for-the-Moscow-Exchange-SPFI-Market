import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import WorkflowStepper from "./WorkflowStepper";
import NextStepBanner from "./NextStepBanner";

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main-area">
        <Topbar />
        <WorkflowStepper />
        <NextStepBanner />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
