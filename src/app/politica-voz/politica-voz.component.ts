import { Component, OnDestroy, OnInit, inject, signal, ChangeDetectionStrategy, ChangeDetectorRef, NgZone, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { PoliticaReporteService, PoliticaReporte } from '../services/politica-reporte.service';
import { ReporteQueryService, ReporteDatos } from '../services/reporte-query.service';
import { AuthService } from '../services/auth.service';

declare global {
  interface Window { SpeechRecognition: new () => SpeechRecognition; webkitSpeechRecognition: new () => SpeechRecognition; }
  interface SpeechRecognition extends EventTarget { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; abort(): void; onresult: ((e: SpeechRecognitionEvent) => void) | null; onerror: ((e: SpeechRecognitionErrorEvent) => void) | null; onend: (() => void) | null; onstart: (() => void) | null; }
  interface SpeechRecognitionEvent extends Event { readonly resultIndex: number; readonly results: SpeechRecognitionResultList; }
  interface SpeechRecognitionResultList { readonly length: number; item(i: number): SpeechRecognitionResult; [i: number]: SpeechRecognitionResult; }
  interface SpeechRecognitionResult { readonly isFinal: boolean; readonly length: number; item(i: number): SpeechRecognitionAlternative; [i: number]: SpeechRecognitionAlternative; }
  interface SpeechRecognitionAlternative { readonly transcript: string; readonly confidence: number; }
  interface SpeechRecognitionErrorEvent extends Event { readonly error: string; readonly message: string; }
}

@Component({
  selector: 'app-politica-voz',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="h-full flex flex-col">

      <!-- HEADER -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-white">Políticas de Negocio</h1>
          <p class="text-white/40 text-sm mt-1">{{ politicas().length }} política{{ politicas().length !== 1 ? 's' : '' }} registrada{{ politicas().length !== 1 ? 's' : '' }}</p>
        </div>
        <button (click)="abrirPanel()"
          class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105"
          style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;box-shadow:0 4px 15px rgba(99,102,241,.4)">
          🎙️ Nueva Política
        </button>
      </div>

      <!-- ERROR CARGA -->
      @if (errorLista()) {
        <div class="mb-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">⚠️ {{ errorLista() }}</div>
      }

      <!-- CARGANDO -->
      @if (cargandoLista()) {
        <div class="flex-1 flex items-center justify-center">
          <div class="flex flex-col items-center gap-4 text-white/40">
            <div class="w-10 h-10 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin"></div>
            <p class="text-sm">Cargando políticas...</p>
          </div>
        </div>
      }

      <!-- LISTA VACÍA -->
      @if (!cargandoLista() && politicas().length === 0 && !errorLista()) {
        <div class="flex-1 flex flex-col items-center justify-center text-white/20 gap-4">
          <span style="font-size:4rem">📋</span>
          <p class="text-lg font-semibold text-white/30">Aún no hay políticas creadas</p>
          <p class="text-sm">Haz clic en "Nueva Política" y dicta tu primera política de negocio.</p>
          <button (click)="abrirPanel()"
            class="mt-2 px-6 py-3 rounded-xl text-sm font-bold"
            style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white">
            🎙️ Crear primera política
          </button>
        </div>
      }

      <!-- GRID DE POLÍTICAS -->
      @if (!cargandoLista() && politicas().length > 0) {
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pb-4">
          @for (p of politicas(); track p.id) {
            <div class="rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 transition-all overflow-hidden cursor-pointer"
                 (click)="verDetalle(p)">
              <div class="h-1" [style.background]="prioridadColor(p.nivelPrioridad)"></div>
              <div class="p-5">
                <div class="flex items-start justify-between gap-2 mb-3">
                  <h3 class="font-bold text-sm text-white leading-tight line-clamp-2">{{ p.tituloPolitica }}</h3>
                  <span class="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                        [class]="categoriaBadgeClass(p.categoria)">{{ p.categoria }}</span>
                </div>
                <p class="text-xs text-white/50 leading-relaxed line-clamp-3 mb-4">{{ p.descripcionGeneral }}</p>
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border" [class]="prioridadBadgeClass(p.nivelPrioridad)">
                    {{ prioridadLabel(p.nivelPrioridad) }}
                  </span>
                  <span class="text-[10px] text-white/30">{{ p.creadoEn | date:'dd/MM/yy HH:mm' }}</span>
                </div>
                <div class="mt-3 pt-3 border-t border-white/5 text-[10px] text-white/30">
                  {{ p.reglasNegocio.length }} regla{{ p.reglasNegocio.length !== 1 ? 's' : '' }} · Por {{ p.generadoPor }}
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- MODAL DETALLE -->
    @if (politicaDetalle()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center" style="background:rgba(0,0,0,.75);backdrop-filter:blur(8px)"
           (click)="politicaDetalle.set(null)">
        <div class="relative w-full max-w-2xl mx-4 rounded-2xl border border-white/10 bg-[#1e1e2e] overflow-hidden max-h-[85vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="h-1" [style.background]="prioridadColor(politicaDetalle()!.nivelPrioridad)"></div>
          <div class="p-6">
            <div class="flex items-start justify-between mb-4">
              <div>
                <p class="text-[10px] text-indigo-400 uppercase tracking-widest mb-1">Política de Negocio</p>
                <h2 class="text-xl font-bold text-white">{{ politicaDetalle()!.tituloPolitica }}</h2>
              </div>
              <button (click)="politicaDetalle.set(null)" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">✕</button>
            </div>
            <div class="flex gap-2 mb-4">
              <span class="text-xs font-bold px-3 py-1 rounded-full border" [class]="categoriaBadgeClass(politicaDetalle()!.categoria)">{{ politicaDetalle()!.categoria }}</span>
              <span class="text-xs font-bold px-3 py-1 rounded-full border" [class]="prioridadBadgeClass(politicaDetalle()!.nivelPrioridad)">{{ prioridadLabel(politicaDetalle()!.nivelPrioridad) }}</span>
            </div>
            <p class="text-sm text-white/70 leading-relaxed mb-5">{{ politicaDetalle()!.descripcionGeneral }}</p>
            <div class="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-5">
              <p class="text-[10px] text-amber-400 uppercase font-bold mb-1">⚡ Impacto Estimado</p>
              <p class="text-sm text-white/70">{{ politicaDetalle()!.impactoEstimado }}</p>
            </div>
            <p class="text-[10px] text-white/40 uppercase font-bold mb-3">Reglas de Negocio ({{ politicaDetalle()!.reglasNegocio.length }})</p>
            <ul class="space-y-2 mb-5">
              @for (r of politicaDetalle()!.reglasNegocio; track $index) {
                <li class="flex items-start gap-3">
                  <span class="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-[10px] font-bold text-indigo-400 flex-shrink-0 mt-0.5">{{ $index+1 }}</span>
                  <span class="text-sm text-white/70">{{ r }}</span>
                </li>
              }
            </ul>
            <div class="border-t border-white/10 pt-4 text-[10px] text-white/30">
              Generado por {{ politicaDetalle()!.generadoPor }} · {{ politicaDetalle()!.creadoEn | date:'dd/MM/yyyy HH:mm' }}
            </div>
          </div>
        </div>
      </div>
    }

    <!-- PANEL LATERAL: NUEVA POLÍTICA -->
    @if (panelAbierto()) {
      <div class="fixed inset-0 z-40" style="background:rgba(0,0,0,.5);backdrop-filter:blur(4px)" (click)="cerrarPanel()"></div>
      <div class="fixed top-0 right-0 h-full w-full max-w-xl z-50 flex flex-col"
           style="background:#1e1e2e;border-left:1px solid rgba(255,255,255,.1);box-shadow:-20px 0 60px rgba(0,0,0,.5)">
        <!-- Panel Header -->
        <div class="p-6 border-b border-white/10 flex items-center justify-between" style="background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(139,92,246,.1))">
          <div>
            <h2 class="text-lg font-bold text-white">Nueva Política de Negocio</h2>
            <p class="text-white/40 text-xs mt-0.5">Dicta o escribe la política y la IA la estructurará</p>
          </div>
          <button (click)="cerrarPanel()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">✕</button>
        </div>

        <!-- Panel Body -->
        <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          <!-- Botón micrófono -->
          <div class="flex flex-col items-center gap-3">
            <button (click)="toggleGrabacion()" [disabled]="cargandoIA()"
              class="relative w-20 h-20 rounded-full flex items-center justify-center text-white font-bold shadow-2xl transition-all duration-300 focus:outline-none disabled:opacity-40"
              [class.bg-indigo-600]="!estaGrabando()" [class.bg-red-600]="estaGrabando()" [class.animate-pulse]="estaGrabando()">
              @if (estaGrabando()) {
                <span class="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-40 animate-ping"></span>
              }
              <svg class="w-8 h-8 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                @if (!estaGrabando()) {
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 16.5A7.5 7.5 0 0 0 19.5 11H21a9 9 0 0 1-18 0h1.5A7.5 7.5 0 0 0 12 17.5zM12 19v3m-3 0h6"/>
                } @else {
                  <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>
                }
              </svg>
            </button>
            <p class="text-sm font-medium" [class.text-white/40]="!estaGrabando()" [class.text-red-400]="estaGrabando()">
              {{ estaGrabando() ? '⏺ Escuchando... habla ahora' : 'Presiona para hablar' }}
            </p>
          </div>

          <!-- Textarea -->
          <textarea [disabled]="cargandoIA() || estaGrabando()" [value]="transcripcionViva()"
            (input)="onTextareaInput($event)"
            placeholder="Usa el micrófono o escribe directamente la política de negocio aquí..."
            class="w-full min-h-[140px] rounded-xl bg-slate-900/60 border p-4 text-slate-200 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60"
            [class.border-red-500]="estaGrabando()" [class.border-white]="!estaGrabando()" style="border-color:rgba(255,255,255,0.1)">
          </textarea>

          @if (mensajeError()) {
            <div class="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">⚠️ {{ mensajeError() }}</div>
          }

          <!-- Resultado IA -->
          @if (!cargandoIA() && politicaResultado()) {
            <div class="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 animate-fade-in">
              <p class="text-[10px] text-indigo-400 uppercase font-bold mb-1">✅ Política Generada y Guardada</p>
              <p class="text-white font-semibold text-sm mb-2">{{ politicaResultado()!.tituloPolitica }}</p>
              <p class="text-xs text-white/60">{{ politicaResultado()!.descripcionGeneral }}</p>
            </div>
          }

          <!-- Spinner -->
          @if (cargandoIA()) {
            <div class="flex flex-col items-center gap-3 py-6">
              <div class="w-10 h-10 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin"></div>
              <p class="text-sm text-white/50">iBPM está estructurando tu política...</p>
            </div>
          }
        </div>

        <!-- Panel Footer -->
        <div class="p-6 border-t border-white/10 flex gap-3">
          <button (click)="reiniciar()" class="flex-1 py-2.5 rounded-xl text-sm border border-white/10 hover:bg-white/10 transition-all text-white">🔄 Limpiar</button>
          @if (transcripcionViva().trim().length > 0 && !estaGrabando()) {
            <button (click)="procesarTextoManual()" [disabled]="cargandoIA()"
              class="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white">
              {{ cargandoIA() ? '⏳ Procesando...' : '🤖 Generar con IA' }}
            </button>
          }
          @if (politicaResultado()) {
            <button (click)="guardarYCerrar()" class="flex-1 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all">
              ✅ Listo
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes fade-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .animate-fade-in { animation: fade-in .35s ease-out forwards; }
    .line-clamp-2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .line-clamp-3 { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  `]
})
export class PoliticaVozComponent implements OnInit, OnDestroy {
  private politicaSvc  = inject(PoliticaReporteService);
  private authSvc      = inject(AuthService);
  private cdr          = inject(ChangeDetectorRef);
  private zone         = inject(NgZone);
  private destroyRef   = inject(DestroyRef);

  // Lista
  politicas       = signal<PoliticaReporte[]>([]);
  cargandoLista   = signal(true);
  errorLista      = signal('');
  politicaDetalle = signal<PoliticaReporte | null>(null);

  // Panel nueva política
  panelAbierto    = signal(false);
  estaGrabando    = signal(false);
  cargandoIA      = signal(false);
  transcripcionConfirmada = signal('');
  transcripcionViva       = signal('');
  politicaResultado       = signal<PoliticaReporte | null>(null);
  mensajeError            = signal('');

  private recognition: SpeechRecognition | null = null;

  ngOnInit() { this.cargarPoliticas(); }
  ngOnDestroy() { this.recognition?.abort(); }

  cargarPoliticas() {
    this.cargandoLista.set(true);
    this.errorLista.set('');
    this.politicaSvc.listarReportes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => { this.politicas.set(data); this.cargandoLista.set(false); this.cdr.markForCheck(); },
      error: () => { this.errorLista.set('No se pudieron cargar las políticas. Verifica la conexión con el servidor.'); this.cargandoLista.set(false); this.cdr.markForCheck(); }
    });
  }

  verDetalle(p: PoliticaReporte) { this.politicaDetalle.set(p); }
  abrirPanel()  { this.panelAbierto.set(true); this.reiniciar(); }
  cerrarPanel() { this.panelAbierto.set(false); this.reiniciar(); }

  guardarYCerrar() {
    const nueva = this.politicaResultado();
    if (nueva) { this.politicas.update(list => [nueva, ...list]); }
    this.cerrarPanel();
  }

  toggleGrabacion() {
    if (this.cargandoIA()) return;
    this.estaGrabando() ? this.recognition?.stop() : this.iniciarGrabacion();
  }

  private iniciarGrabacion() {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechAPI) { this.mensajeError.set('Tu navegador no soporta la Web Speech API. Usa Chrome o Edge.'); return; }
    this.mensajeError.set(''); this.transcripcionConfirmada.set(''); this.transcripcionViva.set(''); this.politicaResultado.set(null);
    this.recognition = new SpeechAPI();
    this.recognition.lang = 'es-BO'; this.recognition.continuous = false; this.recognition.interimResults = true; this.recognition.maxAlternatives = 1;
    this.recognition.onstart  = () => this.zone.run(() => { this.estaGrabando.set(true); this.cdr.markForCheck(); });
    this.recognition.onend    = () => this.zone.run(() => { this.estaGrabando.set(false); this.cdr.markForCheck(); });
    this.recognition.onerror  = (e: SpeechRecognitionErrorEvent) => this.zone.run(() => {
      this.estaGrabando.set(false);
      const msgs: Record<string,string> = { 'no-speech':'No se detectó voz.', 'audio-capture':'No se pudo acceder al micrófono.', 'not-allowed':'Permiso de micrófono denegado.' };
      this.mensajeError.set(msgs[e.error] ?? `Error: ${e.error}`); this.cdr.markForCheck();
    });
    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '', final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        event.results[i].isFinal ? (final += t) : (interim += t);
      }
      this.zone.run(() => {
        if (final) this.transcripcionConfirmada.update(p => (p.trim() ? p.trim() + ' ' : '') + final.trim());
        this.transcripcionViva.set((this.transcripcionConfirmada() + ' ' + interim).trim()); this.cdr.markForCheck();
      });
    };
    this.recognition.start();
  }

  onTextareaInput(e: Event) { const v = (e.target as HTMLTextAreaElement).value; this.transcripcionViva.set(v); this.transcripcionConfirmada.set(v); }

  procesarTextoManual() {
    const texto = this.transcripcionViva().trim();
    if (!texto) return;
    const session = this.authSvc.getSession()();
    const user = session?.name || 'Usuario';
    this.cargandoIA.set(true); this.mensajeError.set(''); this.cdr.markForCheck();
    this.politicaSvc.generarReporte(texto, user).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => { this.politicaResultado.set(r); this.cargandoIA.set(false); this.cdr.markForCheck(); },
      error: (err) => { this.cargandoIA.set(false); this.mensajeError.set(`Error al generar: ${err?.error?.detalle ?? err?.message ?? 'Error desconocido'}`); this.cdr.markForCheck(); }
    });
  }

  reiniciar() { this.recognition?.abort(); this.estaGrabando.set(false); this.cargandoIA.set(false); this.transcripcionConfirmada.set(''); this.transcripcionViva.set(''); this.politicaResultado.set(null); this.mensajeError.set(''); }

  categoriaBadgeClass(c: string) {
    const m: Record<string,string> = { RRHH:'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', FINANZAS:'bg-amber-500/15 text-amber-400 border-amber-500/30', OPERACIONES:'bg-blue-500/15 text-blue-400 border-blue-500/30', TI:'bg-violet-500/15 text-violet-400 border-violet-500/30', LEGAL:'bg-rose-500/15 text-rose-400 border-rose-500/30', CALIDAD:'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', OTROS:'bg-slate-500/15 text-slate-400 border-slate-500/30' };
    return m[c] ?? m['OTROS'];
  }
  prioridadBadgeClass(p: string) {
    const m: Record<string,string> = { BAJA:'bg-slate-500/15 text-slate-400 border-slate-500/30', MEDIA:'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', ALTA:'bg-orange-500/15 text-orange-400 border-orange-500/30', CRITICA:'bg-red-500/15 text-red-400 border-red-500/30' };
    return m[p] ?? m['MEDIA'];
  }
  prioridadColor(p: string) { const m: Record<string,string> = { BAJA:'#64748b', MEDIA:'#eab308', ALTA:'#f97316', CRITICA:'#ef4444' }; return m[p] ?? '#6366f1'; }
  prioridadLabel(p: string) { const m: Record<string,string> = { BAJA:'🟢 Baja', MEDIA:'🟡 Media', ALTA:'🟠 Alta', CRITICA:'🔴 Crítica' }; return m[p] ?? p; }
}
