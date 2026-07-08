import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Captura erros de render em qualquer parte da árvore React. Sem isto, um
 * erro durante o render (ex.: no fluxo de pagamento) desmontava toda a app e
 * deixava o ecrã em branco. Aqui mostramos uma mensagem amigável e um botão
 * para recarregar, em vez do "ecrã branco".
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
    return { hasError: true, message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro capturado pela ErrorBoundary:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-pale-bg p-6">
        <div className="w-full max-w-md rounded-[32px] border-2 border-brand-primary/10 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-brand-primary/10 text-4xl">
            🍓
          </div>
          <h1 className="text-2xl font-black italic text-brand-primary">Algo correu mal</h1>
          <p className="mt-3 text-sm font-bold text-slate-500 leading-relaxed">
            Pedimos desculpa pelo incómodo. Já registámos o problema. Pode tentar recarregar a página para continuar.
          </p>
          {this.state.message && (
            <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-xs font-bold text-red-500 break-words">
              {this.state.message}
            </p>
          )}
          <button
            onClick={this.handleReload}
            className="mt-6 w-full h-14 rounded-[24px] bg-gradient-fruit text-white font-black uppercase tracking-widest text-sm hover:shadow-[0_15px_30px_rgba(255,107,0,0.3)] transition-all"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
