import React from "react";
import Card from "./Card";
import Button from "../components/Button";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("UI boundary captured error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <h1 className="pageTitle">Интерфейс временно недоступен</h1>
          <p className="pageHint">
            Произошла ошибка рендера. Перезагрузите страницу, чтобы восстановить состояние.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <Button onClick={() => window.location.reload()}>Перезагрузить</Button>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
