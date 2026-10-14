export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ajuda_custo_caixa_lancamentos: {
        Row: {
          ajuda_id: string
          colaborador_cpf: string
          colaborador_id: string | null
          colaborador_nome: string
          competencia: string
          created_at: string
          data_lancamento: string
          descricao_grm: string
          grm_retorno: Json | null
          id: string
          iniciado_em: string | null
          lote_id: string
          movimento: string
          processado_em: string | null
          solicitado_em: string
          solicitado_por: string | null
          status: string
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ajuda_id: string
          colaborador_cpf: string
          colaborador_id?: string | null
          colaborador_nome: string
          competencia: string
          created_at?: string
          data_lancamento: string
          descricao_grm: string
          grm_retorno?: Json | null
          id?: string
          iniciado_em?: string | null
          lote_id: string
          movimento: string
          processado_em?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          ajuda_id?: string
          colaborador_cpf?: string
          colaborador_id?: string | null
          colaborador_nome?: string
          competencia?: string
          created_at?: string
          data_lancamento?: string
          descricao_grm?: string
          grm_retorno?: Json | null
          id?: string
          iniciado_em?: string | null
          lote_id?: string
          movimento?: string
          processado_em?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ajuda_custo_caixa_lancamentos_ajuda_id_fkey"
            columns: ["ajuda_id"]
            isOneToOne: false
            referencedRelation: "rh_ajuda_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajuda_custo_caixa_lancamentos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "rh_ajuda_custo_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      alojamentos: {
        Row: {
          ativo: boolean
          cidade: string | null
          created_at: string
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_auditoria: {
        Row: {
          acao: string
          campos_alterados: string[] | null
          created_at: string
          erro: string | null
          id: string
          ip: string | null
          metadata: Json | null
          modulo: string
          origem: string
          registro_id: string | null
          tabela: string | null
          user_agent: string | null
          usuario_email: string | null
          usuario_id: string | null
          valor_anterior: Json | null
          valor_novo: Json | null
        }
        Insert: {
          acao: string
          campos_alterados?: string[] | null
          created_at?: string
          erro?: string | null
          id?: string
          ip?: string | null
          metadata?: Json | null
          modulo: string
          origem?: string
          registro_id?: string | null
          tabela?: string | null
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Update: {
          acao?: string
          campos_alterados?: string[] | null
          created_at?: string
          erro?: string | null
          id?: string
          ip?: string | null
          metadata?: Json | null
          modulo?: string
          origem?: string
          registro_id?: string | null
          tabela?: string | null
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Relationships: []
      }
      app_logs: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json | null
          id: string
          modulo: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          modulo?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          modulo?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_logs_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "app_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_logs_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_contexto_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "app_logs_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_usuario_modulos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      app_logs_usuarios: {
        Row: {
          acao: string
          acao_exata: string | null
          audit_id: string | null
          campos_alterados: string[] | null
          created_at: string
          detalhes: Json | null
          id: string
          ip: string | null
          metadata: Json | null
          modulo: string | null
          origem: string | null
          registro_id: string | null
          tabela: string | null
          tipo: string
          user_agent: string | null
          usuario_email: string | null
          usuario_id: string | null
          usuario_nome: string | null
          usuario_role: string | null
          valor_anterior: Json | null
          valor_novo: Json | null
        }
        Insert: {
          acao: string
          acao_exata?: string | null
          audit_id?: string | null
          campos_alterados?: string[] | null
          created_at?: string
          detalhes?: Json | null
          id?: string
          ip?: string | null
          metadata?: Json | null
          modulo?: string | null
          origem?: string | null
          registro_id?: string | null
          tabela?: string | null
          tipo: string
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
          usuario_role?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Update: {
          acao?: string
          acao_exata?: string | null
          audit_id?: string | null
          campos_alterados?: string[] | null
          created_at?: string
          detalhes?: Json | null
          id?: string
          ip?: string | null
          metadata?: Json | null
          modulo?: string | null
          origem?: string | null
          registro_id?: string | null
          tabela?: string | null
          tipo?: string
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
          usuario_role?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Relationships: []
      }
      app_modulos: {
        Row: {
          ativo: boolean
          categoria: string | null
          codigo: string
          created_at: string
          descricao: string | null
          icone: string | null
          id: string
          nome: string
          ordem: number
          rota: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          codigo: string
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          nome: string
          ordem?: number
          rota: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          codigo?: string
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number
          rota?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_notificacoes: {
        Row: {
          chave_dedup: string | null
          created_at: string
          destinatario: string | null
          evento: string
          id: string
          lida: boolean
          lida_em: string | null
          mensagem: string | null
          modulo: string
          titulo: string
        }
        Insert: {
          chave_dedup?: string | null
          created_at?: string
          destinatario?: string | null
          evento: string
          id?: string
          lida?: boolean
          lida_em?: string | null
          mensagem?: string | null
          modulo: string
          titulo: string
        }
        Update: {
          chave_dedup?: string | null
          created_at?: string
          destinatario?: string | null
          evento?: string
          id?: string
          lida?: boolean
          lida_em?: string | null
          mensagem?: string | null
          modulo?: string
          titulo?: string
        }
        Relationships: []
      }
      app_perfil_modulo: {
        Row: {
          created_at: string
          id: string
          modulo_id: string
          perfil_id: string
          pode_aprovar: boolean
          pode_criar: boolean
          pode_editar: boolean
          pode_excluir: boolean
          pode_ver: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          modulo_id: string
          perfil_id: string
          pode_aprovar?: boolean
          pode_criar?: boolean
          pode_editar?: boolean
          pode_excluir?: boolean
          pode_ver?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          modulo_id?: string
          perfil_id?: string
          pode_aprovar?: boolean
          pode_criar?: boolean
          pode_editar?: boolean
          pode_excluir?: boolean
          pode_ver?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_perfil_modulo_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "app_modulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_perfil_modulo_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "vw_contexto_usuario"
            referencedColumns: ["modulo_id"]
          },
          {
            foreignKeyName: "app_perfil_modulo_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "vw_usuario_modulos"
            referencedColumns: ["modulo_id"]
          },
          {
            foreignKeyName: "app_perfil_modulo_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "app_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_perfil_modulo_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "vw_contexto_usuario"
            referencedColumns: ["perfil_id"]
          },
        ]
      }
      app_perfis: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_usuario_modulos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          created_by: string | null
          id: string
          modulo_id: string
          pode_aprovar: boolean
          pode_criar: boolean
          pode_editar: boolean
          pode_excluir: boolean
          status: string | null
          updated_at: string | null
          updated_by: string | null
          usuario_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          modulo_id: string
          pode_aprovar?: boolean
          pode_criar?: boolean
          pode_editar?: boolean
          pode_excluir?: boolean
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
          usuario_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          modulo_id?: string
          pode_aprovar?: boolean
          pode_criar?: boolean
          pode_editar?: boolean
          pode_excluir?: boolean
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_usuario_modulos_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "app_modulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_usuario_modulos_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "vw_contexto_usuario"
            referencedColumns: ["modulo_id"]
          },
          {
            foreignKeyName: "app_usuario_modulos_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "vw_usuario_modulos"
            referencedColumns: ["modulo_id"]
          },
          {
            foreignKeyName: "app_usuario_modulos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "app_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_usuario_modulos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_contexto_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "app_usuario_modulos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_usuario_modulos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      app_usuarios: {
        Row: {
          ativo: boolean | null
          auth_user_id: string | null
          colaborador_id: string | null
          coordenacao: string | null
          created_at: string
          email: string
          empresa: string | null
          id: string
          nome: string
          perfil_id: string | null
          setor: string | null
          status: string
          supervisao: string | null
          telefone: string | null
          ultimo_login_em: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean | null
          auth_user_id?: string | null
          colaborador_id?: string | null
          coordenacao?: string | null
          created_at?: string
          email: string
          empresa?: string | null
          id?: string
          nome: string
          perfil_id?: string | null
          setor?: string | null
          status?: string
          supervisao?: string | null
          telefone?: string | null
          ultimo_login_em?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean | null
          auth_user_id?: string | null
          colaborador_id?: string | null
          coordenacao?: string | null
          created_at?: string
          email?: string
          empresa?: string | null
          id?: string
          nome?: string
          perfil_id?: string | null
          setor?: string | null
          status?: string
          supervisao?: string | null
          telefone?: string | null
          ultimo_login_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_usuarios_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "app_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_usuarios_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "vw_contexto_usuario"
            referencedColumns: ["perfil_id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          referencia_id: string
          referencia_tipo: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          referencia_id: string
          referencia_tipo: string
          storage_path: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          referencia_id?: string
          referencia_tipo?: string
          storage_path?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_agrupamentos: {
        Row: {
          auditor: string | null
          auditoria_ids: string[]
          created_at: string
          id: string
          pagamento_id: string | null
          pix: string | null
          quantidade: number
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          auditor?: string | null
          auditoria_ids?: string[]
          created_at?: string
          id?: string
          pagamento_id?: string | null
          pix?: string | null
          quantidade?: number
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          auditor?: string | null
          auditoria_ids?: string[]
          created_at?: string
          id?: string
          pagamento_id?: string | null
          pix?: string | null
          quantidade?: number
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      auditoria_solicitacoes: {
        Row: {
          agrupamento_id: string | null
          auditor: string | null
          auditor_colaborador: boolean
          classificacao_origem: string | null
          classificador: string | null
          cliente: string | null
          coordenacao: string | null
          created_at: string
          data_auditoria: string | null
          data_classificacao: string | null
          gestor: string | null
          gestor_id: string | null
          id: string
          motivo_recusa: string | null
          observacao: string | null
          ok_em: string | null
          origem: string
          origem_detalhe: Json | null
          os: string | null
          pagamento_id: string | null
          pagamento_solicitado: boolean
          perdera_bonus: boolean
          pix: string | null
          placa: string | null
          resultado_auditoria: string | null
          status: string
          supervisao: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          agrupamento_id?: string | null
          auditor?: string | null
          auditor_colaborador?: boolean
          classificacao_origem?: string | null
          classificador?: string | null
          cliente?: string | null
          coordenacao?: string | null
          created_at?: string
          data_auditoria?: string | null
          data_classificacao?: string | null
          gestor?: string | null
          gestor_id?: string | null
          id?: string
          motivo_recusa?: string | null
          observacao?: string | null
          ok_em?: string | null
          origem?: string
          origem_detalhe?: Json | null
          os?: string | null
          pagamento_id?: string | null
          pagamento_solicitado?: boolean
          perdera_bonus?: boolean
          pix?: string | null
          placa?: string | null
          resultado_auditoria?: string | null
          status?: string
          supervisao?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          agrupamento_id?: string | null
          auditor?: string | null
          auditor_colaborador?: boolean
          classificacao_origem?: string | null
          classificador?: string | null
          cliente?: string | null
          coordenacao?: string | null
          created_at?: string
          data_auditoria?: string | null
          data_classificacao?: string | null
          gestor?: string | null
          gestor_id?: string | null
          id?: string
          motivo_recusa?: string | null
          observacao?: string | null
          ok_em?: string | null
          origem?: string
          origem_detalhe?: Json | null
          os?: string | null
          pagamento_id?: string | null
          pagamento_solicitado?: boolean
          perdera_bonus?: boolean
          pix?: string | null
          placa?: string | null
          resultado_auditoria?: string | null
          status?: string
          supervisao?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      bonus_auditoria_inaptos: {
        Row: {
          arquivo_nome: string | null
          colaborador_nome: string
          competencia: string
          descricao_desconto: string | null
          id: number
          importado_em: string
          importado_por: string | null
          nome_normalizado: string
          valor_desconto: number
        }
        Insert: {
          arquivo_nome?: string | null
          colaborador_nome: string
          competencia: string
          descricao_desconto?: string | null
          id?: number
          importado_em?: string
          importado_por?: string | null
          nome_normalizado: string
          valor_desconto?: number
        }
        Update: {
          arquivo_nome?: string | null
          colaborador_nome?: string
          competencia?: string
          descricao_desconto?: string | null
          id?: number
          importado_em?: string
          importado_por?: string | null
          nome_normalizado?: string
          valor_desconto?: number
        }
        Relationships: []
      }
      bonus_caixa_lancamentos: {
        Row: {
          colaborador_nome: string
          competencia: string
          grm_retorno: Json | null
          id: string
          iniciado_em: string | null
          nome_normalizado: string
          processado_em: string | null
          solicitado_em: string
          solicitado_por: string | null
          status: string
          tentativas: number
          tons: number
          ultimo_erro: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          colaborador_nome: string
          competencia: string
          grm_retorno?: Json | null
          id?: string
          iniciado_em?: string | null
          nome_normalizado: string
          processado_em?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tentativas?: number
          tons?: number
          ultimo_erro?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          colaborador_nome?: string
          competencia?: string
          grm_retorno?: Json | null
          id?: string
          iniciado_em?: string | null
          nome_normalizado?: string
          processado_em?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tentativas?: number
          tons?: number
          ultimo_erro?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      bonus_competencias_fechadas: {
        Row: {
          competencia: string
          created_at: string
          fechado_em: string
          fechado_por: string | null
          observacao: string | null
          origem: string
          snapshot_qtd: number
          snapshot_valor_apto: number
          updated_at: string
        }
        Insert: {
          competencia: string
          created_at?: string
          fechado_em?: string
          fechado_por?: string | null
          observacao?: string | null
          origem?: string
          snapshot_qtd?: number
          snapshot_valor_apto?: number
          updated_at?: string
        }
        Update: {
          competencia?: string
          created_at?: string
          fechado_em?: string
          fechado_por?: string | null
          observacao?: string | null
          origem?: string
          snapshot_qtd?: number
          snapshot_valor_apto?: number
          updated_at?: string
        }
        Relationships: []
      }
      bonus_desconto_caixa_lancamentos: {
        Row: {
          colaborador_nome: string
          competencia: string
          descricao: string | null
          grm_retorno: Json | null
          id: string
          iniciado_em: string | null
          nome_normalizado: string
          processado_em: string | null
          solicitado_em: string
          solicitado_por: string | null
          status: string
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
          valor: number
          valor_original: number
        }
        Insert: {
          colaborador_nome: string
          competencia: string
          descricao?: string | null
          grm_retorno?: Json | null
          id?: string
          iniciado_em?: string | null
          nome_normalizado: string
          processado_em?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
          valor?: number
          valor_original?: number
        }
        Update: {
          colaborador_nome?: string
          competencia?: string
          descricao?: string | null
          grm_retorno?: Json | null
          id?: string
          iniciado_em?: string | null
          nome_normalizado?: string
          processado_em?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
          valor?: number
          valor_original?: number
        }
        Relationships: []
      }
      bonus_producao_cache: {
        Row: {
          atualizado_em: string
          colaborador: string
          competencia: string
          inapto_auditoria: boolean
          motivo: string | null
          nome_normalizado: string
          patrimonio_dias: number | null
          status: string
          tons: number
          valor: number
        }
        Insert: {
          atualizado_em?: string
          colaborador: string
          competencia: string
          inapto_auditoria?: boolean
          motivo?: string | null
          nome_normalizado: string
          patrimonio_dias?: number | null
          status: string
          tons?: number
          valor?: number
        }
        Update: {
          atualizado_em?: string
          colaborador?: string
          competencia?: string
          inapto_auditoria?: boolean
          motivo?: string | null
          nome_normalizado?: string
          patrimonio_dias?: number | null
          status?: string
          tons?: number
          valor?: number
        }
        Relationships: []
      }
      bonus_producao_cache_meta: {
        Row: {
          atualizado_em: string
          competencia: string
        }
        Insert: {
          atualizado_em?: string
          competencia: string
        }
        Update: {
          atualizado_em?: string
          competencia?: string
        }
        Relationships: []
      }
      bonus_producao_fechada: {
        Row: {
          colaborador: string
          competencia: string
          created_at: string
          fechado_em: string
          fonte_snapshot: string
          inapto_auditoria: boolean
          motivo: string | null
          nome_normalizado: string
          patrimonio_dias: number | null
          status: string
          status_lancamento_snapshot: string | null
          tons: number
          valor: number
        }
        Insert: {
          colaborador: string
          competencia: string
          created_at?: string
          fechado_em: string
          fonte_snapshot?: string
          inapto_auditoria?: boolean
          motivo?: string | null
          nome_normalizado: string
          patrimonio_dias?: number | null
          status: string
          status_lancamento_snapshot?: string | null
          tons?: number
          valor?: number
        }
        Update: {
          colaborador?: string
          competencia?: string
          created_at?: string
          fechado_em?: string
          fonte_snapshot?: string
          inapto_auditoria?: boolean
          motivo?: string | null
          nome_normalizado?: string
          patrimonio_dias?: number | null
          status?: string
          status_lancamento_snapshot?: string | null
          tons?: number
          valor?: number
        }
        Relationships: []
      }
      bot_jobs: {
        Row: {
          created_at: string | null
          erro: number | null
          id: string
          processado: number | null
          status: string | null
          sucesso: number | null
          tipo: string | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          erro?: number | null
          id?: string
          processado?: number | null
          status?: string | null
          sucesso?: number | null
          tipo?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          erro?: number | null
          id?: string
          processado?: number | null
          status?: string | null
          sucesso?: number | null
          tipo?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bot_queue: {
        Row: {
          created_at: string | null
          erro: string | null
          id: string
          max_tentativas: number | null
          payload: Json | null
          status: string | null
          tentativas: number | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          erro?: string | null
          id?: string
          max_tentativas?: number | null
          payload?: Json | null
          status?: string | null
          tentativas?: number | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          erro?: string | null
          id?: string
          max_tentativas?: number | null
          payload?: Json | null
          status?: string | null
          tentativas?: number | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      botconversa_config: {
        Row: {
          ativo: boolean
          chave: string
          created_at: string
          empresa: string | null
          id: string
          updated_at: string
          valor: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          created_at?: string
          empresa?: string | null
          id?: string
          updated_at?: string
          valor: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          created_at?: string
          empresa?: string | null
          id?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      botconversa_contatos: {
        Row: {
          ativo: boolean
          cpf: string | null
          created_at: string
          email: string | null
          empresa: string | null
          id: string
          metadata: Json
          nome: string | null
          subscriber_id: string | null
          synced_at: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          email?: string | null
          empresa?: string | null
          id?: string
          metadata?: Json
          nome?: string | null
          subscriber_id?: string | null
          synced_at?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          email?: string | null
          empresa?: string | null
          id?: string
          metadata?: Json
          nome?: string | null
          subscriber_id?: string | null
          synced_at?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      botconversa_fila: {
        Row: {
          cpf: string | null
          created_at: string
          empresa: string | null
          erro: string | null
          flow_id: string | null
          id: string
          mensagem: string | null
          nome: string | null
          origem: string | null
          payload: Json
          processado_at: string | null
          status: string
          subscriber_id: string | null
          telefone: string
          tentativas: number
          tipo: string
          ultima_tentativa_at: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          empresa?: string | null
          erro?: string | null
          flow_id?: string | null
          id?: string
          mensagem?: string | null
          nome?: string | null
          origem?: string | null
          payload?: Json
          processado_at?: string | null
          status?: string
          subscriber_id?: string | null
          telefone: string
          tentativas?: number
          tipo: string
          ultima_tentativa_at?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          empresa?: string | null
          erro?: string | null
          flow_id?: string | null
          id?: string
          mensagem?: string | null
          nome?: string | null
          origem?: string | null
          payload?: Json
          processado_at?: string | null
          status?: string
          subscriber_id?: string | null
          telefone?: string
          tentativas?: number
          tipo?: string
          ultima_tentativa_at?: string | null
        }
        Relationships: []
      }
      botconversa_fluxos: {
        Row: {
          ativo: boolean
          created_at: string
          empresa: string
          flow_id: string
          id: string
          nome: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa: string
          flow_id: string
          id?: string
          nome: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa?: string
          flow_id?: string
          id?: string
          nome?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      botconversa_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          erro: string | null
          filtros: Json
          finished_at: string | null
          id: string
          observacoes: string | null
          status: string
          tipo: string
          total_erro: number
          total_processado: number
          total_sucesso: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          erro?: string | null
          filtros?: Json
          finished_at?: string | null
          id?: string
          observacoes?: string | null
          status?: string
          tipo: string
          total_erro?: number
          total_processado?: number
          total_sucesso?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          erro?: string | null
          filtros?: Json
          finished_at?: string | null
          id?: string
          observacoes?: string | null
          status?: string
          tipo?: string
          total_erro?: number
          total_processado?: number
          total_sucesso?: number
        }
        Relationships: []
      }
      botconversa_logs: {
        Row: {
          cpf: string | null
          created_at: string
          empresa: string | null
          erro: string | null
          fila_id: string | null
          flow_id: string | null
          http_status: number | null
          id: number
          job_id: string | null
          mensagem: string | null
          nome: string | null
          origem: string | null
          request_payload: Json | null
          response_payload: Json | null
          subscriber_id: string | null
          sucesso: boolean
          telefone: string | null
          tipo: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          empresa?: string | null
          erro?: string | null
          fila_id?: string | null
          flow_id?: string | null
          http_status?: number | null
          id?: number
          job_id?: string | null
          mensagem?: string | null
          nome?: string | null
          origem?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          subscriber_id?: string | null
          sucesso?: boolean
          telefone?: string | null
          tipo?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          empresa?: string | null
          erro?: string | null
          fila_id?: string | null
          flow_id?: string | null
          http_status?: number | null
          id?: number
          job_id?: string | null
          mensagem?: string | null
          nome?: string | null
          origem?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          subscriber_id?: string | null
          sucesso?: boolean
          telefone?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      botconversa_tags: {
        Row: {
          contato_id: string | null
          created_at: string
          id: string
          tag: string
        }
        Insert: {
          contato_id?: string | null
          created_at?: string
          id?: string
          tag: string
        }
        Update: {
          contato_id?: string | null
          created_at?: string
          id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "botconversa_tags_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "botconversa_contatos"
            referencedColumns: ["id"]
          },
        ]
      }
      botconversa_webhook_logs: {
        Row: {
          created_at: string
          event_name: string | null
          headers: Json | null
          id: number
          payload: Json
        }
        Insert: {
          created_at?: string
          event_name?: string | null
          headers?: Json | null
          id?: number
          payload?: Json
        }
        Update: {
          created_at?: string
          event_name?: string | null
          headers?: Json | null
          id?: number
          payload?: Json
        }
        Relationships: []
      }
      chamados_ti: {
        Row: {
          categoria: string
          created_at: string
          descricao: string
          id: string
          modulo_relacionado: string | null
          prioridade: string
          resolvido_em: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          solicitante_id: string
          solicitante_nome: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          categoria: string
          created_at?: string
          descricao: string
          id?: string
          modulo_relacionado?: string | null
          prioridade?: string
          resolvido_em?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          solicitante_id: string
          solicitante_nome: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          descricao?: string
          id?: string
          modulo_relacionado?: string | null
          prioridade?: string
          resolvido_em?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          solicitante_id?: string
          solicitante_nome?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      chamados_ti_comentarios: {
        Row: {
          autor_id: string
          autor_nome: string
          chamado_id: string
          created_at: string
          id: string
          mensagem: string
        }
        Insert: {
          autor_id: string
          autor_nome: string
          chamado_id: string
          created_at?: string
          id?: string
          mensagem: string
        }
        Update: {
          autor_id?: string
          autor_nome?: string
          chamado_id?: string
          created_at?: string
          id?: string
          mensagem?: string
        }
        Relationships: [
          {
            foreignKeyName: "chamados_ti_comentarios_chamado_id_fkey"
            columns: ["chamado_id"]
            isOneToOne: false
            referencedRelation: "chamados_ti"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_nacionais: {
        Row: {
          ativo: boolean
          created_at: string
          grm_id: number
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          grm_id: number
          id: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          grm_id?: number
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      colaborador_cruzamento: {
        Row: {
          atualizado_em: string
          auditorias_180d_peso: number
          auditorias_180d_qtd: number
          colaborador_id: string
          coordenacao: string | null
          cpf: string | null
          endereco_base: string | null
          latitude: number | null
          longitude: number | null
          nome: string | null
          nome_chave: string | null
          salario: number | null
          supervisao: string | null
          tipo_contrato: string | null
          veiculo_id: string | null
          veiculo_placa: string | null
        }
        Insert: {
          atualizado_em?: string
          auditorias_180d_peso?: number
          auditorias_180d_qtd?: number
          colaborador_id: string
          coordenacao?: string | null
          cpf?: string | null
          endereco_base?: string | null
          latitude?: number | null
          longitude?: number | null
          nome?: string | null
          nome_chave?: string | null
          salario?: number | null
          supervisao?: string | null
          tipo_contrato?: string | null
          veiculo_id?: string | null
          veiculo_placa?: string | null
        }
        Update: {
          atualizado_em?: string
          auditorias_180d_peso?: number
          auditorias_180d_qtd?: number
          colaborador_id?: string
          coordenacao?: string | null
          cpf?: string | null
          endereco_base?: string | null
          latitude?: number | null
          longitude?: number | null
          nome?: string | null
          nome_chave?: string | null
          salario?: number | null
          supervisao?: string | null
          tipo_contrato?: string | null
          veiculo_id?: string | null
          veiculo_placa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_cruzamento_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: true
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_cruzamento_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: true
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_cruzamento_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: true
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_cruzamento_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "frotas_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      colaborador_cruzamento_staging: {
        Row: {
          atualizado_em: string
          auditorias_180d_peso: number
          auditorias_180d_qtd: number
          colaborador_id: string
          coordenacao: string | null
          cpf: string | null
          endereco_base: string | null
          latitude: number | null
          longitude: number | null
          nome: string | null
          nome_chave: string | null
          salario: number | null
          supervisao: string | null
          tipo_contrato: string | null
          veiculo_id: string | null
          veiculo_placa: string | null
        }
        Insert: {
          atualizado_em?: string
          auditorias_180d_peso?: number
          auditorias_180d_qtd?: number
          colaborador_id: string
          coordenacao?: string | null
          cpf?: string | null
          endereco_base?: string | null
          latitude?: number | null
          longitude?: number | null
          nome?: string | null
          nome_chave?: string | null
          salario?: number | null
          supervisao?: string | null
          tipo_contrato?: string | null
          veiculo_id?: string | null
          veiculo_placa?: string | null
        }
        Update: {
          atualizado_em?: string
          auditorias_180d_peso?: number
          auditorias_180d_qtd?: number
          colaborador_id?: string
          coordenacao?: string | null
          cpf?: string | null
          endereco_base?: string | null
          latitude?: number | null
          longitude?: number | null
          nome?: string | null
          nome_chave?: string | null
          salario?: number | null
          supervisao?: string | null
          tipo_contrato?: string | null
          veiculo_id?: string | null
          veiculo_placa?: string | null
        }
        Relationships: []
      }
      colaborador_importacoes: {
        Row: {
          arquivo_nome: string | null
          created_at: string
          data_referencia: string
          id: string
          importado_por: string | null
          observacoes: string | null
          origem: string
          status: string
          total_linhas: number
        }
        Insert: {
          arquivo_nome?: string | null
          created_at?: string
          data_referencia: string
          id?: string
          importado_por?: string | null
          observacoes?: string | null
          origem?: string
          status?: string
          total_linhas?: number
        }
        Update: {
          arquivo_nome?: string | null
          created_at?: string
          data_referencia?: string
          id?: string
          importado_por?: string | null
          observacoes?: string | null
          origem?: string
          status?: string
          total_linhas?: number
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_importacoes_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      colaborador_snapshot: {
        Row: {
          admissao: string | null
          ativo: boolean
          bairro: string | null
          cargo: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          conta_bancaria: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          data_referencia: string
          desligamento: string | null
          email: string | null
          email_empresa: string | null
          email_pessoal: string | null
          empresa: string | null
          endereco: string | null
          estado: string | null
          id: string
          importacao_id: string
          nome: string
          salario: number | null
          setor: string | null
          situacao: string | null
          supervisao: string | null
          tipo: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          admissao?: string | null
          ativo?: boolean
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          data_referencia: string
          desligamento?: string | null
          email?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          importacao_id: string
          nome: string
          salario?: number | null
          setor?: string | null
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          admissao?: string | null
          ativo?: boolean
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          data_referencia?: string
          desligamento?: string | null
          email?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          importacao_id?: string
          nome?: string
          salario?: number | null
          setor?: string | null
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_snapshot_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "colaborador_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores: {
        Row: {
          admissao: string | null
          bairro: string | null
          cargo: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          conta_bancaria_despesas: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          desligamento: string | null
          email_empresa: string | null
          email_pessoal: string | null
          empresa: string | null
          endereco: string | null
          estado: string | null
          grm_staff_code: number | null
          id: string
          metadata: Json | null
          nome: string
          salario: string | null
          sexo: string | null
          sincronizado_em: string | null
          situacao: string | null
          supervisao: string | null
          tipo: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          admissao?: string | null
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria_despesas?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          desligamento?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          grm_staff_code?: number | null
          id?: string
          metadata?: Json | null
          nome: string
          salario?: string | null
          sexo?: string | null
          sincronizado_em?: string | null
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          admissao?: string | null
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria_despesas?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          desligamento?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          grm_staff_code?: number | null
          id?: string
          metadata?: Json | null
          nome?: string
          salario?: string | null
          sexo?: string | null
          sincronizado_em?: string | null
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      colaboradores_alteracoes: {
        Row: {
          campos_alterados: string[]
          colaborador_id: string | null
          cpf: string | null
          detectado_em: string
          event_key: string
          fonte: string
          grm_staff_code: number | null
          id: string
          metadata: Json
          nome: string
          tipo_evento: string
          valores_anteriores: Json
          valores_novos: Json
        }
        Insert: {
          campos_alterados?: string[]
          colaborador_id?: string | null
          cpf?: string | null
          detectado_em?: string
          event_key: string
          fonte?: string
          grm_staff_code?: number | null
          id?: string
          metadata?: Json
          nome: string
          tipo_evento: string
          valores_anteriores?: Json
          valores_novos?: Json
        }
        Update: {
          campos_alterados?: string[]
          colaborador_id?: string | null
          cpf?: string | null
          detectado_em?: string
          event_key?: string
          fonte?: string
          grm_staff_code?: number | null
          id?: string
          metadata?: Json
          nome?: string
          tipo_evento?: string
          valores_anteriores?: Json
          valores_novos?: Json
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_alteracoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_alteracoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_alteracoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores_historico: {
        Row: {
          admissao: string | null
          ativo: boolean
          bairro: string | null
          cargo: string | null
          cep: string | null
          chave_colaborador: string | null
          cidade: string | null
          complemento: string | null
          conta_bancaria: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          data_referencia: string
          desligamento: string | null
          email_empresa: string | null
          email_pessoal: string | null
          empresa: string | null
          endereco: string | null
          estado: string | null
          id: string
          importacao_id: string | null
          nome: string
          nome_normalizado: string | null
          payload: Json
          salario: number | null
          situacao: string | null
          supervisao: string | null
          tipo: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          admissao?: string | null
          ativo?: boolean
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          chave_colaborador?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          data_referencia: string
          desligamento?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          importacao_id?: string | null
          nome: string
          nome_normalizado?: string | null
          payload?: Json
          salario?: number | null
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          admissao?: string | null
          ativo?: boolean
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          chave_colaborador?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          data_referencia?: string
          desligamento?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          importacao_id?: string | null
          nome?: string
          nome_normalizado?: string | null
          payload?: Json
          salario?: number | null
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      colaboradores_status_historico: {
        Row: {
          ativo_anterior: boolean | null
          ativo_novo: boolean
          colaborador_id: string | null
          cpf: string
          data_efetiva: string
          detectado_em: string
          fonte: string
          id: string
          metadata: Json
          nome: string
          relatorio_referencia: string | null
          situacao_anterior: string | null
          situacao_nova: string
        }
        Insert: {
          ativo_anterior?: boolean | null
          ativo_novo: boolean
          colaborador_id?: string | null
          cpf: string
          data_efetiva: string
          detectado_em?: string
          fonte?: string
          id?: string
          metadata?: Json
          nome: string
          relatorio_referencia?: string | null
          situacao_anterior?: string | null
          situacao_nova: string
        }
        Update: {
          ativo_anterior?: boolean | null
          ativo_novo?: boolean
          colaborador_id?: string | null
          cpf?: string
          data_efetiva?: string
          detectado_em?: string
          fonte?: string
          id?: string
          metadata?: Json
          nome?: string
          relatorio_referencia?: string | null
          situacao_anterior?: string | null
          situacao_nova?: string
        }
        Relationships: []
      }
      comercial_propostas: {
        Row: {
          aprovada: boolean
          aprovada_em: string | null
          aprovada_por: string | null
          arquivo_final_url: string | null
          cliente: string
          condicoes: string | null
          created_at: string
          criado_por: string | null
          id: string
          produtos: Json | null
          responsavel: string | null
          status: string
          tratamentos: Json | null
          updated_at: string
          valores: Json | null
          vencimento: string | null
          versao: number
        }
        Insert: {
          aprovada?: boolean
          aprovada_em?: string | null
          aprovada_por?: string | null
          arquivo_final_url?: string | null
          cliente: string
          condicoes?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          produtos?: Json | null
          responsavel?: string | null
          status?: string
          tratamentos?: Json | null
          updated_at?: string
          valores?: Json | null
          vencimento?: string | null
          versao?: number
        }
        Update: {
          aprovada?: boolean
          aprovada_em?: string | null
          aprovada_por?: string | null
          arquivo_final_url?: string | null
          cliente?: string
          condicoes?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          produtos?: Json | null
          responsavel?: string | null
          status?: string
          tratamentos?: Json | null
          updated_at?: string
          valores?: Json | null
          vencimento?: string | null
          versao?: number
        }
        Relationships: []
      }
      compras_catalogo: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          material: string
          observacao: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          material: string
          observacao?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          material?: string
          observacao?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      compras_codigo_contadores: {
        Row: {
          ano: number
          contador: number
          mes: number
          tipo: string
        }
        Insert: {
          ano: number
          contador?: number
          mes: number
          tipo: string
        }
        Update: {
          ano?: number
          contador?: number
          mes?: number
          tipo?: string
        }
        Relationships: []
      }
      compras_cotacoes: {
        Row: {
          boleto_url: string | null
          chave_pix: string | null
          created_at: string
          dados_pagamento: string | null
          forma_pagamento: string | null
          fornecedor: string | null
          id: string
          itens_ids: string[]
          link_pagamento: string | null
          status: string
          titulo: string | null
          updated_at: string
          valor_total: number | null
        }
        Insert: {
          boleto_url?: string | null
          chave_pix?: string | null
          created_at?: string
          dados_pagamento?: string | null
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: string
          itens_ids?: string[]
          link_pagamento?: string | null
          status?: string
          titulo?: string | null
          updated_at?: string
          valor_total?: number | null
        }
        Update: {
          boleto_url?: string | null
          chave_pix?: string | null
          created_at?: string
          dados_pagamento?: string | null
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: string
          itens_ids?: string[]
          link_pagamento?: string | null
          status?: string
          titulo?: string | null
          updated_at?: string
          valor_total?: number | null
        }
        Relationships: []
      }
      compras_estoque_config: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          tipo: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      compras_estoque_inventarios: {
        Row: {
          created_at: string
          diferenca: number
          estoque_contado: number
          estoque_sistema: number
          id: string
          material_id: string
          motivo_ajuste: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          created_at?: string
          diferenca?: number
          estoque_contado?: number
          estoque_sistema?: number
          id?: string
          material_id: string
          motivo_ajuste: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          created_at?: string
          diferenca?: number
          estoque_contado?: number
          estoque_sistema?: number
          id?: string
          material_id?: string
          motivo_ajuste?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_estoque_inventarios_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "compras_estoque_materiais"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_estoque_materiais: {
        Row: {
          ativo: boolean
          categoria: string
          codigo_interno: string | null
          created_at: string
          estoque_atual: number
          estoque_maximo: number
          estoque_minimo: number
          id: string
          local_armazenamento: string | null
          nome: string
          observacao: string | null
          tamanho: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          codigo_interno?: string | null
          created_at?: string
          estoque_atual?: number
          estoque_maximo?: number
          estoque_minimo?: number
          id?: string
          local_armazenamento?: string | null
          nome: string
          observacao?: string | null
          tamanho?: string | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          codigo_interno?: string | null
          created_at?: string
          estoque_atual?: number
          estoque_maximo?: number
          estoque_minimo?: number
          id?: string
          local_armazenamento?: string | null
          nome?: string
          observacao?: string | null
          tamanho?: string | null
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      compras_estoque_movimentacoes: {
        Row: {
          colaborador_id: string | null
          colaborador_nome: string | null
          coordenacao: string | null
          created_at: string
          data_movimentacao: string
          destino: string | null
          fornecedor: string | null
          id: string
          material_id: string
          motivo: string | null
          numero_nf: string | null
          observacao: string | null
          quantidade: number
          supervisao: string | null
          tipo_movimentacao: string
          usuario_id: string | null
          usuario_nome: string | null
          valor_unitario: number | null
        }
        Insert: {
          colaborador_id?: string | null
          colaborador_nome?: string | null
          coordenacao?: string | null
          created_at?: string
          data_movimentacao?: string
          destino?: string | null
          fornecedor?: string | null
          id?: string
          material_id: string
          motivo?: string | null
          numero_nf?: string | null
          observacao?: string | null
          quantidade: number
          supervisao?: string | null
          tipo_movimentacao: string
          usuario_id?: string | null
          usuario_nome?: string | null
          valor_unitario?: number | null
        }
        Update: {
          colaborador_id?: string | null
          colaborador_nome?: string | null
          coordenacao?: string | null
          created_at?: string
          data_movimentacao?: string
          destino?: string | null
          fornecedor?: string | null
          id?: string
          material_id?: string
          motivo?: string | null
          numero_nf?: string | null
          observacao?: string | null
          quantidade?: number
          supervisao?: string | null
          tipo_movimentacao?: string
          usuario_id?: string | null
          usuario_nome?: string | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_estoque_movimentacoes_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "compras_estoque_materiais"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_itens: {
        Row: {
          aprovacao_anexo_url: string | null
          aprovado_em: string | null
          aprovado_por: string | null
          boleto_url: string | null
          ca: string | null
          codigo: string | null
          colaborador_cargo: string | null
          colaborador_coordenacao: string | null
          colaborador_cpf: string | null
          colaborador_data_admissao: string | null
          colaborador_data_nascimento: string | null
          colaborador_empresa: string | null
          colaborador_funcao: string | null
          colaborador_id: string | null
          colaborador_nome: string | null
          colaborador_rg: string | null
          colaborador_setor: string | null
          colaborador_supervisao: string | null
          colaborador_tipo: string | null
          comprado_em: string | null
          comprovante_url: string | null
          created_at: string
          dados_pagamento: string | null
          entrega_endereco: string | null
          entrega_tipo: string | null
          envio_tipo: string | null
          epi_ficha_gerada_em: string | null
          estoque_movimentacao_id: string | null
          forma_pagamento: string | null
          fornecedor: string | null
          fornecedor_cnpj: string | null
          id: string
          marca: string | null
          material: string
          mensagem_aprovacao: string | null
          mensagem_cotacao: string | null
          motivo_recusa: string | null
          nf_busca_iniciada_em: string | null
          nf_busca_status: string
          nf_busca_ultima_em: string | null
          nf_lancado: boolean
          nf_lancado_em: string | null
          nf_lembrete_enviado_em: string | null
          nf_sugestao: Json | null
          nf_sugestoes_rejeitadas: string[]
          nf_url: string | null
          quantidade: number
          recusado_por: string | null
          regional: string | null
          solicitacao_id: string
          status: string
          tamanho: string | null
          tipo: string | null
          unidade: number
          uniforme_cor: string | null
          updated_at: string
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          aprovacao_anexo_url?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          boleto_url?: string | null
          ca?: string | null
          codigo?: string | null
          colaborador_cargo?: string | null
          colaborador_coordenacao?: string | null
          colaborador_cpf?: string | null
          colaborador_data_admissao?: string | null
          colaborador_data_nascimento?: string | null
          colaborador_empresa?: string | null
          colaborador_funcao?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          colaborador_rg?: string | null
          colaborador_setor?: string | null
          colaborador_supervisao?: string | null
          colaborador_tipo?: string | null
          comprado_em?: string | null
          comprovante_url?: string | null
          created_at?: string
          dados_pagamento?: string | null
          entrega_endereco?: string | null
          entrega_tipo?: string | null
          envio_tipo?: string | null
          epi_ficha_gerada_em?: string | null
          estoque_movimentacao_id?: string | null
          forma_pagamento?: string | null
          fornecedor?: string | null
          fornecedor_cnpj?: string | null
          id?: string
          marca?: string | null
          material: string
          mensagem_aprovacao?: string | null
          mensagem_cotacao?: string | null
          motivo_recusa?: string | null
          nf_busca_iniciada_em?: string | null
          nf_busca_status?: string
          nf_busca_ultima_em?: string | null
          nf_lancado?: boolean
          nf_lancado_em?: string | null
          nf_lembrete_enviado_em?: string | null
          nf_sugestao?: Json | null
          nf_sugestoes_rejeitadas?: string[]
          nf_url?: string | null
          quantidade?: number
          recusado_por?: string | null
          regional?: string | null
          solicitacao_id: string
          status?: string
          tamanho?: string | null
          tipo?: string | null
          unidade?: number
          uniforme_cor?: string | null
          updated_at?: string
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          aprovacao_anexo_url?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          boleto_url?: string | null
          ca?: string | null
          codigo?: string | null
          colaborador_cargo?: string | null
          colaborador_coordenacao?: string | null
          colaborador_cpf?: string | null
          colaborador_data_admissao?: string | null
          colaborador_data_nascimento?: string | null
          colaborador_empresa?: string | null
          colaborador_funcao?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          colaborador_rg?: string | null
          colaborador_setor?: string | null
          colaborador_supervisao?: string | null
          colaborador_tipo?: string | null
          comprado_em?: string | null
          comprovante_url?: string | null
          created_at?: string
          dados_pagamento?: string | null
          entrega_endereco?: string | null
          entrega_tipo?: string | null
          envio_tipo?: string | null
          epi_ficha_gerada_em?: string | null
          estoque_movimentacao_id?: string | null
          forma_pagamento?: string | null
          fornecedor?: string | null
          fornecedor_cnpj?: string | null
          id?: string
          marca?: string | null
          material?: string
          mensagem_aprovacao?: string | null
          mensagem_cotacao?: string | null
          motivo_recusa?: string | null
          nf_busca_iniciada_em?: string | null
          nf_busca_status?: string
          nf_busca_ultima_em?: string | null
          nf_lancado?: boolean
          nf_lancado_em?: string | null
          nf_lembrete_enviado_em?: string | null
          nf_sugestao?: Json | null
          nf_sugestoes_rejeitadas?: string[]
          nf_url?: string | null
          quantidade?: number
          recusado_por?: string | null
          regional?: string | null
          solicitacao_id?: string
          status?: string
          tamanho?: string | null
          tipo?: string | null
          unidade?: number
          uniforme_cor?: string | null
          updated_at?: string
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_itens_estoque_movimentacao_id_fkey"
            columns: ["estoque_movimentacao_id"]
            isOneToOne: false
            referencedRelation: "compras_estoque_movimentacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_itens_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "compras_solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_notificacoes_config: {
        Row: {
          ativo: boolean
          cpf: string | null
          created_at: string
          empresa: string | null
          id: string
          nome: string
          setor: string
          telefone: string
        }
        Insert: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          empresa?: string | null
          id?: string
          nome: string
          setor: string
          telefone: string
        }
        Update: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          empresa?: string | null
          id?: string
          nome?: string
          setor?: string
          telefone?: string
        }
        Relationships: []
      }
      compras_patrimonios_cadastro: {
        Row: {
          compra_item_id: string | null
          conferido_em: string | null
          coordenacao: string | null
          created_at: string
          id: string
          informado_em: string | null
          marca: string | null
          material: string | null
          numero_patrimonio: string | null
          observacao: string | null
          status: string
          updated_at: string
        }
        Insert: {
          compra_item_id?: string | null
          conferido_em?: string | null
          coordenacao?: string | null
          created_at?: string
          id?: string
          informado_em?: string | null
          marca?: string | null
          material?: string | null
          numero_patrimonio?: string | null
          observacao?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          compra_item_id?: string | null
          conferido_em?: string | null
          coordenacao?: string | null
          created_at?: string
          id?: string
          informado_em?: string | null
          marca?: string | null
          material?: string | null
          numero_patrimonio?: string | null
          observacao?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_patrimonios_cadastro_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compras_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_solicitacoes: {
        Row: {
          cidade: string | null
          colaborador_id: string | null
          colaborador_nome: string | null
          coordenacao: string | null
          created_at: string
          created_by: string | null
          data_solicitacao: string
          fornecedor: string | null
          id: string
          observacoes: string | null
          prioridade: string | null
          solicitante: string | null
          solicitante_id: string | null
          status: string
          supervisao: string | null
          telefone_fornecedor: string | null
          tipo_solicitacao: string | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          cidade?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          coordenacao?: string | null
          created_at?: string
          created_by?: string | null
          data_solicitacao: string
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          prioridade?: string | null
          solicitante?: string | null
          solicitante_id?: string | null
          status?: string
          supervisao?: string | null
          telefone_fornecedor?: string | null
          tipo_solicitacao?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          cidade?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          coordenacao?: string | null
          created_at?: string
          created_by?: string | null
          data_solicitacao?: string
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          prioridade?: string | null
          solicitante?: string | null
          solicitante_id?: string | null
          status?: string
          supervisao?: string | null
          telefone_fornecedor?: string | null
          tipo_solicitacao?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_solicitacoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conferencia_descontos: {
        Row: {
          colaborador: string | null
          coordenacao: string | null
          created_at: string | null
          data_referencia: string | null
          id: string
          meta: Json | null
          nome: string | null
          observacao: string | null
          observacoes: string | null
          origem: string | null
          prazo: string | null
          prazo_devolucao: string | null
          quantidade: number | null
          regional: string | null
          situacao: string | null
          status: string | null
          supervisao: string | null
          un: number | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          colaborador?: string | null
          coordenacao?: string | null
          created_at?: string | null
          data_referencia?: string | null
          id?: string
          meta?: Json | null
          nome?: string | null
          observacao?: string | null
          observacoes?: string | null
          origem?: string | null
          prazo?: string | null
          prazo_devolucao?: string | null
          quantidade?: number | null
          regional?: string | null
          situacao?: string | null
          status?: string | null
          supervisao?: string | null
          un?: number | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          colaborador?: string | null
          coordenacao?: string | null
          created_at?: string | null
          data_referencia?: string | null
          id?: string
          meta?: Json | null
          nome?: string | null
          observacao?: string | null
          observacoes?: string | null
          origem?: string | null
          prazo?: string | null
          prazo_devolucao?: string | null
          quantidade?: number | null
          regional?: string | null
          situacao?: string | null
          status?: string | null
          supervisao?: string | null
          un?: number | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      conferencia_despesas: {
        Row: {
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          data_referencia: string
          descricao: string | null
          id: string
          notificacao_id: string | null
          programacao_id: string | null
          setor_destino: string
          status: string
          tipo_despesa: string
          updated_at: string
          valor: number
        }
        Insert: {
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_referencia?: string
          descricao?: string | null
          id?: string
          notificacao_id?: string | null
          programacao_id?: string | null
          setor_destino: string
          status?: string
          tipo_despesa: string
          updated_at?: string
          valor?: number
        }
        Update: {
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_referencia?: string
          descricao?: string | null
          id?: string
          notificacao_id?: string | null
          programacao_id?: string | null
          setor_destino?: string
          status?: string
          tipo_despesa?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "conferencia_despesas_notificacao_id_fkey"
            columns: ["notificacao_id"]
            isOneToOne: false
            referencedRelation: "painel_notificacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conferencia_despesas_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conferencia_despesas_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      conferencia_geocoding_cache: {
        Row: {
          address_key: string
          created_at: string
          display_name: string | null
          endereco_original: string
          id: string
          latitude: number
          longitude: number
          provider: string
          updated_at: string
        }
        Insert: {
          address_key: string
          created_at?: string
          display_name?: string | null
          endereco_original: string
          id?: string
          latitude: number
          longitude: number
          provider?: string
          updated_at?: string
        }
        Update: {
          address_key?: string
          created_at?: string
          display_name?: string | null
          endereco_original?: string
          id?: string
          latitude?: number
          longitude?: number
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      conferencia_localizacao_colaboradores: {
        Row: {
          atualizado_em: string
          cliente: string | null
          colaborador_key: string
          colaborador_latitude: number | null
          colaborador_longitude: number | null
          coordenacao: string | null
          data_referencia: string
          distancia_km: number | null
          id: string
          login_distancia_km: number | null
          login_hora: string | null
          login_latitude: number | null
          login_longitude: number | null
          nome_colaborador: string | null
          numero_os: string | null
          os_id: string | null
          os_latitude: number | null
          os_longitude: number | null
          os_ponto_nome: string | null
          ponto_embarque_id: string | null
          ponto_embarque_latitude: number | null
          ponto_embarque_longitude: number | null
          ponto_embarque_nome: string | null
          supervisao: string | null
        }
        Insert: {
          atualizado_em?: string
          cliente?: string | null
          colaborador_key: string
          colaborador_latitude?: number | null
          colaborador_longitude?: number | null
          coordenacao?: string | null
          data_referencia: string
          distancia_km?: number | null
          id?: string
          login_distancia_km?: number | null
          login_hora?: string | null
          login_latitude?: number | null
          login_longitude?: number | null
          nome_colaborador?: string | null
          numero_os?: string | null
          os_id?: string | null
          os_latitude?: number | null
          os_longitude?: number | null
          os_ponto_nome?: string | null
          ponto_embarque_id?: string | null
          ponto_embarque_latitude?: number | null
          ponto_embarque_longitude?: number | null
          ponto_embarque_nome?: string | null
          supervisao?: string | null
        }
        Update: {
          atualizado_em?: string
          cliente?: string | null
          colaborador_key?: string
          colaborador_latitude?: number | null
          colaborador_longitude?: number | null
          coordenacao?: string | null
          data_referencia?: string
          distancia_km?: number | null
          id?: string
          login_distancia_km?: number | null
          login_hora?: string | null
          login_latitude?: number | null
          login_longitude?: number | null
          nome_colaborador?: string | null
          numero_os?: string | null
          os_id?: string | null
          os_latitude?: number | null
          os_longitude?: number | null
          os_ponto_nome?: string | null
          ponto_embarque_id?: string | null
          ponto_embarque_latitude?: number | null
          ponto_embarque_longitude?: number | null
          ponto_embarque_nome?: string | null
          supervisao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conferencia_localizacao_colaboradores_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "operacional_os"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conferencia_localizacao_colaboradores_ponto_embarque_id_fkey"
            columns: ["ponto_embarque_id"]
            isOneToOne: false
            referencedRelation: "operacional_pontos_embarque"
            referencedColumns: ["id"]
          },
        ]
      }
      conferencia_uber_corridas: {
        Row: {
          arquivo_nome: string | null
          arquivo_origem: string | null
          centro_custo: string | null
          cidade: string | null
          classificacao_manual: string | null
          coord: string | null
          created_at: string
          data_chegada_local: string | null
          data_chegada_utc: string | null
          data_hora_transacao_utc: string | null
          data_solicitacao_local: string | null
          destino_latitude: number | null
          destino_longitude: number | null
          detalhamento_despesa: string | null
          distancia_km: number | null
          distancia_mi: number | null
          duracao_min: number | null
          email: string | null
          endereco_destino: string | null
          endereco_partida: string | null
          external_id: string | null
          finalidade: string | null
          grupo: string | null
          hora_chegada_local: string | null
          hora_chegada_utc: string | null
          hora_solicitacao_local: string | null
          hora_solicitacao_utc: string | null
          id: string
          import_hash: string | null
          importacao_id: string | null
          matricula: string | null
          metodo_pagamento: string | null
          motivo_validacao: string | null
          nome: string | null
          nome_colaborador: string | null
          observacao: string | null
          observacao_validacao: string | null
          origem: string | null
          pais: string | null
          partida_latitude: number | null
          partida_longitude: number | null
          preco_liquido: number | null
          programa: string | null
          raw: Json | null
          regional: string | null
          servico: string | null
          status_validacao: string
          supervisao: string | null
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          validado_por_nome: string | null
          valor: number | null
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_origem?: string | null
          centro_custo?: string | null
          cidade?: string | null
          classificacao_manual?: string | null
          coord?: string | null
          created_at?: string
          data_chegada_local?: string | null
          data_chegada_utc?: string | null
          data_hora_transacao_utc?: string | null
          data_solicitacao_local?: string | null
          destino_latitude?: number | null
          destino_longitude?: number | null
          detalhamento_despesa?: string | null
          distancia_km?: number | null
          distancia_mi?: number | null
          duracao_min?: number | null
          email?: string | null
          endereco_destino?: string | null
          endereco_partida?: string | null
          external_id?: string | null
          finalidade?: string | null
          grupo?: string | null
          hora_chegada_local?: string | null
          hora_chegada_utc?: string | null
          hora_solicitacao_local?: string | null
          hora_solicitacao_utc?: string | null
          id?: string
          import_hash?: string | null
          importacao_id?: string | null
          matricula?: string | null
          metodo_pagamento?: string | null
          motivo_validacao?: string | null
          nome?: string | null
          nome_colaborador?: string | null
          observacao?: string | null
          observacao_validacao?: string | null
          origem?: string | null
          pais?: string | null
          partida_latitude?: number | null
          partida_longitude?: number | null
          preco_liquido?: number | null
          programa?: string | null
          raw?: Json | null
          regional?: string | null
          servico?: string | null
          status_validacao?: string
          supervisao?: string | null
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          validado_por_nome?: string | null
          valor?: number | null
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_origem?: string | null
          centro_custo?: string | null
          cidade?: string | null
          classificacao_manual?: string | null
          coord?: string | null
          created_at?: string
          data_chegada_local?: string | null
          data_chegada_utc?: string | null
          data_hora_transacao_utc?: string | null
          data_solicitacao_local?: string | null
          destino_latitude?: number | null
          destino_longitude?: number | null
          detalhamento_despesa?: string | null
          distancia_km?: number | null
          distancia_mi?: number | null
          duracao_min?: number | null
          email?: string | null
          endereco_destino?: string | null
          endereco_partida?: string | null
          external_id?: string | null
          finalidade?: string | null
          grupo?: string | null
          hora_chegada_local?: string | null
          hora_chegada_utc?: string | null
          hora_solicitacao_local?: string | null
          hora_solicitacao_utc?: string | null
          id?: string
          import_hash?: string | null
          importacao_id?: string | null
          matricula?: string | null
          metodo_pagamento?: string | null
          motivo_validacao?: string | null
          nome?: string | null
          nome_colaborador?: string | null
          observacao?: string | null
          observacao_validacao?: string | null
          origem?: string | null
          pais?: string | null
          partida_latitude?: number | null
          partida_longitude?: number | null
          preco_liquido?: number | null
          programa?: string | null
          raw?: Json | null
          regional?: string | null
          servico?: string | null
          status_validacao?: string
          supervisao?: string | null
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          validado_por_nome?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      contato_cliente_registros: {
        Row: {
          anexos: Json | null
          assunto: string | null
          cliente: string | null
          contato: string | null
          created_at: string
          created_by: string | null
          data_contato: string
          id: string
          observacoes: string | null
          participantes_cliente: Json | null
          participantes_grao1000: Json | null
          retorno_previsto: string | null
          status: string
        }
        Insert: {
          anexos?: Json | null
          assunto?: string | null
          cliente?: string | null
          contato?: string | null
          created_at?: string
          created_by?: string | null
          data_contato: string
          id?: string
          observacoes?: string | null
          participantes_cliente?: Json | null
          participantes_grao1000?: Json | null
          retorno_previsto?: string | null
          status?: string
        }
        Update: {
          anexos?: Json | null
          assunto?: string | null
          cliente?: string | null
          contato?: string | null
          created_at?: string
          created_by?: string | null
          data_contato?: string
          id?: string
          observacoes?: string | null
          participantes_cliente?: Json | null
          participantes_grao1000?: Json | null
          retorno_previsto?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contato_cliente_registros_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      correios_envios: {
        Row: {
          anexos: Json | null
          codigo_rastreio: string | null
          comprovante_url: string | null
          created_at: string
          criado_por: string | null
          destinatario: string | null
          endereco: string | null
          historico: Json
          id: string
          observacao: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          anexos?: Json | null
          codigo_rastreio?: string | null
          comprovante_url?: string | null
          created_at?: string
          criado_por?: string | null
          destinatario?: string | null
          endereco?: string | null
          historico?: Json
          id?: string
          observacao?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          anexos?: Json | null
          codigo_rastreio?: string | null
          comprovante_url?: string | null
          created_at?: string
          criado_por?: string | null
          destinatario?: string | null
          endereco?: string | null
          historico?: Json
          id?: string
          observacao?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      dashboard_cache: {
        Row: {
          ano: number | null
          atualizado_em: string
          atualizado_por: string | null
          created_at: string
          dados_json: Json
          escopo: string
          hash_origem: string | null
          id: string
          mes: number | null
          modulo: string
          origem_importacao: string | null
          referencia: string
        }
        Insert: {
          ano?: number | null
          atualizado_em?: string
          atualizado_por?: string | null
          created_at?: string
          dados_json?: Json
          escopo?: string
          hash_origem?: string | null
          id?: string
          mes?: number | null
          modulo: string
          origem_importacao?: string | null
          referencia: string
        }
        Update: {
          ano?: number | null
          atualizado_em?: string
          atualizado_por?: string | null
          created_at?: string
          dados_json?: Json
          escopo?: string
          hash_origem?: string | null
          id?: string
          mes?: number | null
          modulo?: string
          origem_importacao?: string | null
          referencia?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      deslocamento_config: {
        Row: {
          chave: string
          updated_at: string
          valor: Json
        }
        Insert: {
          chave: string
          updated_at?: string
          valor?: Json
        }
        Update: {
          chave?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      diretoria_desenvolvimento: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          created_by_name: string | null
          data_conclusao: string | null
          data_inicio: string | null
          descricao: string
          id: string
          impedimentos: string | null
          modulo: string
          ordem: number
          previsao_conclusao: string | null
          prioridade: string
          progresso: number
          proxima_etapa: string | null
          responsavel: string | null
          status: string
          submenu: string | null
          tipo: string
          titulo: string
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          data_conclusao?: string | null
          data_inicio?: string | null
          descricao: string
          id?: string
          impedimentos?: string | null
          modulo: string
          ordem?: number
          previsao_conclusao?: string | null
          prioridade?: string
          progresso?: number
          proxima_etapa?: string | null
          responsavel?: string | null
          status?: string
          submenu?: string | null
          tipo?: string
          titulo: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          data_conclusao?: string | null
          data_inicio?: string | null
          descricao?: string
          id?: string
          impedimentos?: string | null
          modulo?: string
          ordem?: number
          previsao_conclusao?: string | null
          prioridade?: string
          progresso?: number
          proxima_etapa?: string | null
          responsavel?: string | null
          status?: string
          submenu?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: []
      }
      diretoria_desenvolvimento_atualizacoes: {
        Row: {
          autor_id: string | null
          autor_nome: string | null
          created_at: string
          descricao: string
          desenvolvimento_id: string
          id: string
          progresso_anterior: number | null
          progresso_novo: number | null
          status_anterior: string | null
          status_novo: string | null
        }
        Insert: {
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          descricao: string
          desenvolvimento_id: string
          id?: string
          progresso_anterior?: number | null
          progresso_novo?: number | null
          status_anterior?: string | null
          status_novo?: string | null
        }
        Update: {
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          descricao?: string
          desenvolvimento_id?: string
          id?: string
          progresso_anterior?: number | null
          progresso_novo?: number | null
          status_anterior?: string | null
          status_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diretoria_desenvolvimento_atualizacoes_desenvolvimento_id_fkey"
            columns: ["desenvolvimento_id"]
            isOneToOne: false
            referencedRelation: "diretoria_desenvolvimento"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_despesas_mensal: {
        Row: {
          ano: number
          coordenacao: string
          id: number
          mes: number
          rateio: number | null
          total_com_rateio: number | null
          total_coordenacao: number | null
          total_geral: number | null
          total_todas_regionais: number | null
          updated_at: string
        }
        Insert: {
          ano: number
          coordenacao: string
          id?: number
          mes: number
          rateio?: number | null
          total_com_rateio?: number | null
          total_coordenacao?: number | null
          total_geral?: number | null
          total_todas_regionais?: number | null
          updated_at?: string
        }
        Update: {
          ano?: number
          coordenacao?: string
          id?: number
          mes?: number
          rateio?: number | null
          total_com_rateio?: number | null
          total_coordenacao?: number | null
          total_geral?: number | null
          total_todas_regionais?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      dre_importacoes: {
        Row: {
          ano: number
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          id: string
          observacoes: string | null
          origem: string | null
          status: string
          total_linhas: number | null
          updated_at: string
        }
        Insert: {
          ano: number
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          id?: string
          observacoes?: string | null
          origem?: string | null
          status?: string
          total_linhas?: number | null
          updated_at?: string
        }
        Update: {
          ano?: number
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          id?: string
          observacoes?: string | null
          origem?: string | null
          status?: string
          total_linhas?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      dre_lancamentos: {
        Row: {
          ano: number
          created_at: string
          id: string
          importacao_id: string | null
          indicador: string
          mes: number
          mes_nome: string
          regional: string
          tipo_dre: string
          valor: number | null
        }
        Insert: {
          ano: number
          created_at?: string
          id?: string
          importacao_id?: string | null
          indicador: string
          mes: number
          mes_nome: string
          regional: string
          tipo_dre?: string
          valor?: number | null
        }
        Update: {
          ano?: number
          created_at?: string
          id?: string
          importacao_id?: string | null
          indicador?: string
          mes?: number
          mes_nome?: string
          regional?: string
          tipo_dre?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dre_lancamentos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "dre_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      efetivos_sem_producao: {
        Row: {
          cargo: string | null
          colaborador: string | null
          coordenacao: string | null
          created_at: string | null
          data_referencia: string | null
          id: string
          motivo: string | null
          supervisao: string | null
          tipo: string | null
        }
        Insert: {
          cargo?: string | null
          colaborador?: string | null
          coordenacao?: string | null
          created_at?: string | null
          data_referencia?: string | null
          id?: string
          motivo?: string | null
          supervisao?: string | null
          tipo?: string | null
        }
        Update: {
          cargo?: string | null
          colaborador?: string | null
          coordenacao?: string | null
          created_at?: string | null
          data_referencia?: string | null
          id?: string
          motivo?: string | null
          supervisao?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      email_accounts: {
        Row: {
          ativo: boolean
          auto_encaminhar: boolean
          auto_responder: boolean
          conectada_em: string | null
          conexao_status: string
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          email: string
          escopo: string
          id: string
          imap_host: string
          imap_port: number
          imap_secure: boolean
          limite_por_sync: number
          nome: string
          owner_auth_user_id: string | null
          password_cipher: string
          pasta_entrada: string
          pasta_processados: string | null
          provider: string
          smtp_host: string
          smtp_port: number
          smtp_secure: boolean
          ultima_sync_em: string | null
          ultima_sync_erro: string | null
          ultima_sync_status: string | null
          ultima_uid: number | null
          ultima_verificacao_em: string | null
          updated_at: string
          username: string
        }
        Insert: {
          ativo?: boolean
          auto_encaminhar?: boolean
          auto_responder?: boolean
          conectada_em?: string | null
          conexao_status?: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          email: string
          escopo?: string
          id?: string
          imap_host?: string
          imap_port?: number
          imap_secure?: boolean
          limite_por_sync?: number
          nome: string
          owner_auth_user_id?: string | null
          password_cipher: string
          pasta_entrada?: string
          pasta_processados?: string | null
          provider?: string
          smtp_host?: string
          smtp_port?: number
          smtp_secure?: boolean
          ultima_sync_em?: string | null
          ultima_sync_erro?: string | null
          ultima_sync_status?: string | null
          ultima_uid?: number | null
          ultima_verificacao_em?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          ativo?: boolean
          auto_encaminhar?: boolean
          auto_responder?: boolean
          conectada_em?: string | null
          conexao_status?: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          email?: string
          escopo?: string
          id?: string
          imap_host?: string
          imap_port?: number
          imap_secure?: boolean
          limite_por_sync?: number
          nome?: string
          owner_auth_user_id?: string | null
          password_cipher?: string
          pasta_entrada?: string
          pasta_processados?: string | null
          provider?: string
          smtp_host?: string
          smtp_port?: number
          smtp_secure?: boolean
          ultima_sync_em?: string | null
          ultima_sync_erro?: string | null
          ultima_sync_status?: string | null
          ultima_uid?: number | null
          ultima_verificacao_em?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      email_attachments: {
        Row: {
          content_id: string | null
          created_at: string
          dados_extraidos: Json
          email_id: string
          file_name: string | null
          id: string
          interpretacao_status: string | null
          interpretado_em: string | null
          mime_type: string | null
          nome_arquivo: string
          storage_bucket: string
          storage_path: string | null
          tamanho_bytes: number | null
          tipo_arquivo: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          dados_extraidos?: Json
          email_id: string
          file_name?: string | null
          id?: string
          interpretacao_status?: string | null
          interpretado_em?: string | null
          mime_type?: string | null
          nome_arquivo: string
          storage_bucket?: string
          storage_path?: string | null
          tamanho_bytes?: number | null
          tipo_arquivo?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          dados_extraidos?: Json
          email_id?: string
          file_name?: string | null
          id?: string
          interpretacao_status?: string | null
          interpretado_em?: string | null
          mime_type?: string | null
          nome_arquivo?: string
          storage_bucket?: string
          storage_path?: string | null
          tamanho_bytes?: number | null
          tipo_arquivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_gestores_regionais: {
        Row: {
          ativo: boolean
          created_at: string
          gestor_email: string
          gestor_nome: string
          id: string
          regional: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          gestor_email: string
          gestor_nome: string
          id?: string
          regional: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          gestor_email?: string
          gestor_nome?: string
          id?: string
          regional?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_historico: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json
          email_id: string | null
          id: string
          outbox_id: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json
          email_id?: string | null
          id?: string
          outbox_id?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json
          email_id?: string | null
          id?: string
          outbox_id?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_historico_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_historico_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "email_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      email_mailbox_states: {
        Row: {
          account_id: string
          created_at: string
          id: string
          mailbox_path: string
          uid_validity: string | null
          ultima_sync_em: string | null
          ultima_sync_erro: string | null
          ultima_sync_status: string | null
          ultima_uid: number
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          mailbox_path: string
          uid_validity?: string | null
          ultima_sync_em?: string | null
          ultima_sync_erro?: string | null
          ultima_sync_status?: string | null
          ultima_uid?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          mailbox_path?: string
          uid_validity?: string | null
          ultima_sync_em?: string | null
          ultima_sync_erro?: string | null
          ultima_sync_status?: string | null
          ultima_uid?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_mailbox_states_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_mailbox_states_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          account_id: string
          arquivado_em: string | null
          assunto: string | null
          categoria: string | null
          cc: string | null
          classificado_por: string | null
          corpo_html: string | null
          corpo_texto: string | null
          created_at: string
          dados_detectados: Json
          data_recebimento: string | null
          destinatario: string | null
          encaminhar_sugerido_cc: string | null
          encaminhar_sugerido_para: string | null
          excluido_em: string | null
          favorito: boolean
          id: string
          imap_erro: string | null
          imap_mailbox: string | null
          imap_pendente: boolean
          imap_uid: number | null
          imap_uid_validity: string | null
          in_reply_to: string | null
          lido: boolean
          mailbox_path: string
          message_id: string
          message_uid: number | null
          os_sugestao_aguardar: Json | null
          precisa_resposta: boolean
          prioridade: string
          raw: Json
          references_header: string | null
          regional: string | null
          remetente: string | null
          remetente_email: string | null
          remetente_nome: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          resposta_sugerida: string | null
          resumo_ia: string | null
          risco: string | null
          status: string
          uid: number | null
          updated_at: string
        }
        Insert: {
          account_id: string
          arquivado_em?: string | null
          assunto?: string | null
          categoria?: string | null
          cc?: string | null
          classificado_por?: string | null
          corpo_html?: string | null
          corpo_texto?: string | null
          created_at?: string
          dados_detectados?: Json
          data_recebimento?: string | null
          destinatario?: string | null
          encaminhar_sugerido_cc?: string | null
          encaminhar_sugerido_para?: string | null
          excluido_em?: string | null
          favorito?: boolean
          id?: string
          imap_erro?: string | null
          imap_mailbox?: string | null
          imap_pendente?: boolean
          imap_uid?: number | null
          imap_uid_validity?: string | null
          in_reply_to?: string | null
          lido?: boolean
          mailbox_path?: string
          message_id: string
          message_uid?: number | null
          os_sugestao_aguardar?: Json | null
          precisa_resposta?: boolean
          prioridade?: string
          raw?: Json
          references_header?: string | null
          regional?: string | null
          remetente?: string | null
          remetente_email?: string | null
          remetente_nome?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          resposta_sugerida?: string | null
          resumo_ia?: string | null
          risco?: string | null
          status?: string
          uid?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          arquivado_em?: string | null
          assunto?: string | null
          categoria?: string | null
          cc?: string | null
          classificado_por?: string | null
          corpo_html?: string | null
          corpo_texto?: string | null
          created_at?: string
          dados_detectados?: Json
          data_recebimento?: string | null
          destinatario?: string | null
          encaminhar_sugerido_cc?: string | null
          encaminhar_sugerido_para?: string | null
          excluido_em?: string | null
          favorito?: boolean
          id?: string
          imap_erro?: string | null
          imap_mailbox?: string | null
          imap_pendente?: boolean
          imap_uid?: number | null
          imap_uid_validity?: string | null
          in_reply_to?: string | null
          lido?: boolean
          mailbox_path?: string
          message_id?: string
          message_uid?: number | null
          os_sugestao_aguardar?: Json | null
          precisa_resposta?: boolean
          prioridade?: string
          raw?: Json
          references_header?: string | null
          regional?: string | null
          remetente?: string | null
          remetente_email?: string | null
          remetente_nome?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          resposta_sugerida?: string | null
          resumo_ia?: string | null
          risco?: string | null
          status?: string
          uid?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          account_id: string
          aprovado_em: string | null
          aprovado_por: string | null
          aprovado_por_nome: string | null
          assunto: string
          bcc: string | null
          cc: string | null
          corpo: string
          created_at: string
          email_id: string | null
          enviado_em: string | null
          erro: string | null
          id: string
          para: string
          smtp_message_id: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          account_id: string
          aprovado_em?: string | null
          aprovado_por?: string | null
          aprovado_por_nome?: string | null
          assunto: string
          bcc?: string | null
          cc?: string | null
          corpo: string
          created_at?: string
          email_id?: string | null
          enviado_em?: string | null
          erro?: string | null
          id?: string
          para: string
          smtp_message_id?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          aprovado_em?: string | null
          aprovado_por?: string | null
          aprovado_por_nome?: string | null
          assunto?: string
          bcc?: string | null
          cc?: string | null
          corpo?: string
          created_at?: string
          email_id?: string | null
          enviado_em?: string | null
          erro?: string | null
          id?: string
          para?: string
          smtp_message_id?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_regionais_keywords: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          palavra: string
          prioridade: number
          regional: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          palavra: string
          prioridade?: number
          regional: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          palavra?: string
          prioridade?: number
          regional?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_regras: {
        Row: {
          assunto_contem: string | null
          ativo: boolean
          auto_encaminhar: boolean
          auto_responder: boolean
          categoria: string | null
          cc_fixo_email: string | null
          created_at: string
          destino_fixo_email: string | null
          destino_regional: boolean
          id: string
          nome: string
          palavras_chave: string[]
          precisa_resposta: boolean | null
          prioridade: number
          prioridade_email: string | null
          regional: string | null
          remetente_contem: string | null
          resposta_modelo: string | null
          risco: string | null
          updated_at: string
        }
        Insert: {
          assunto_contem?: string | null
          ativo?: boolean
          auto_encaminhar?: boolean
          auto_responder?: boolean
          categoria?: string | null
          cc_fixo_email?: string | null
          created_at?: string
          destino_fixo_email?: string | null
          destino_regional?: boolean
          id?: string
          nome: string
          palavras_chave?: string[]
          precisa_resposta?: boolean | null
          prioridade?: number
          prioridade_email?: string | null
          regional?: string | null
          remetente_contem?: string | null
          resposta_modelo?: string | null
          risco?: string | null
          updated_at?: string
        }
        Update: {
          assunto_contem?: string | null
          ativo?: boolean
          auto_encaminhar?: boolean
          auto_responder?: boolean
          categoria?: string | null
          cc_fixo_email?: string | null
          created_at?: string
          destino_fixo_email?: string | null
          destino_regional?: boolean
          id?: string
          nome?: string
          palavras_chave?: string[]
          precisa_resposta?: boolean | null
          prioridade?: number
          prioridade_email?: string | null
          regional?: string | null
          remetente_contem?: string | null
          resposta_modelo?: string | null
          risco?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      envios_correios_token_cache: {
        Row: {
          expires_at: string
          id: number
          token: string
          updated_at: string
        }
        Insert: {
          expires_at: string
          id?: number
          token: string
          updated_at?: string
        }
        Update: {
          expires_at?: string
          id?: number
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      envios_destinatarios: {
        Row: {
          ativo: boolean
          bairro: string
          cep: string
          cidade: string
          colaborador_id: string | null
          complemento: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          id: string
          logradouro: string
          matricula: string | null
          nome: string
          numero: string
          origem: string | null
          telefone: string | null
          uf: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro: string
          cep: string
          cidade: string
          colaborador_id?: string | null
          complemento?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logradouro: string
          matricula?: string | null
          nome: string
          numero: string
          origem?: string | null
          telefone?: string | null
          uf: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string
          cep?: string
          cidade?: string
          colaborador_id?: string | null
          complemento?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logradouro?: string
          matricula?: string | null
          nome?: string
          numero?: string
          origem?: string | null
          telefone?: string | null
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      envios_postagens: {
        Row: {
          altura_cm: number | null
          ar_digital: boolean
          comprimento_cm: number | null
          confirmado_em: string | null
          conteudo: string | null
          created_at: string
          created_by: string | null
          destinatario_id: string
          diametro_cm: number | null
          formato: string
          id: string
          id_prepostagem: string | null
          largura_cm: number | null
          numero_objeto: string | null
          observacoes: string | null
          peso_gramas: number
          remetente_id: string
          servico_codigo: string
          servico_nome: string
          status: string
          updated_at: string
          valor_declarado: number | null
          valor_postagem: number | null
        }
        Insert: {
          altura_cm?: number | null
          ar_digital?: boolean
          comprimento_cm?: number | null
          confirmado_em?: string | null
          conteudo?: string | null
          created_at?: string
          created_by?: string | null
          destinatario_id: string
          diametro_cm?: number | null
          formato?: string
          id?: string
          id_prepostagem?: string | null
          largura_cm?: number | null
          numero_objeto?: string | null
          observacoes?: string | null
          peso_gramas?: number
          remetente_id: string
          servico_codigo: string
          servico_nome: string
          status?: string
          updated_at?: string
          valor_declarado?: number | null
          valor_postagem?: number | null
        }
        Update: {
          altura_cm?: number | null
          ar_digital?: boolean
          comprimento_cm?: number | null
          confirmado_em?: string | null
          conteudo?: string | null
          created_at?: string
          created_by?: string | null
          destinatario_id?: string
          diametro_cm?: number | null
          formato?: string
          id?: string
          id_prepostagem?: string | null
          largura_cm?: number | null
          numero_objeto?: string | null
          observacoes?: string | null
          peso_gramas?: number
          remetente_id?: string
          servico_codigo?: string
          servico_nome?: string
          status?: string
          updated_at?: string
          valor_declarado?: number | null
          valor_postagem?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "envios_postagens_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "envios_destinatarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_postagens_remetente_id_fkey"
            columns: ["remetente_id"]
            isOneToOne: false
            referencedRelation: "envios_remetentes"
            referencedColumns: ["id"]
          },
        ]
      }
      envios_rastreamento: {
        Row: {
          created_at: string
          evento_data: string | null
          evento_descricao: string | null
          evento_local: string | null
          evento_tipo: string | null
          id: string
          numero_objeto: string
          postagem_id: string
          raw_json: Json | null
        }
        Insert: {
          created_at?: string
          evento_data?: string | null
          evento_descricao?: string | null
          evento_local?: string | null
          evento_tipo?: string | null
          id?: string
          numero_objeto: string
          postagem_id: string
          raw_json?: Json | null
        }
        Update: {
          created_at?: string
          evento_data?: string | null
          evento_descricao?: string | null
          evento_local?: string | null
          evento_tipo?: string | null
          id?: string
          numero_objeto?: string
          postagem_id?: string
          raw_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "envios_rastreamento_postagem_id_fkey"
            columns: ["postagem_id"]
            isOneToOne: false
            referencedRelation: "envios_postagens"
            referencedColumns: ["id"]
          },
        ]
      }
      envios_remetentes: {
        Row: {
          ativo: boolean
          bairro: string
          cep: string
          cidade: string
          complemento: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          id: string
          logradouro: string
          nome: string
          numero: string
          padrao: boolean
          telefone: string | null
          uf: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro: string
          cep: string
          cidade: string
          complemento?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logradouro: string
          nome: string
          numero: string
          padrao?: boolean
          telefone?: string | null
          uf: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string
          cep?: string
          cidade?: string
          complemento?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logradouro?: string
          nome?: string
          numero?: string
          padrao?: boolean
          telefone?: string | null
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      envios_reversa: {
        Row: {
          cliente_id: string | null
          confirmado_em: string | null
          conteudo: string | null
          created_at: string | null
          empresa_id: string | null
          id: string
          id_prepostagem: string | null
          numero_objeto: string | null
          observacoes: string | null
          peso_gramas: number | null
          servico_codigo: string
          servico_nome: string | null
          status: string
          updated_at: string | null
          valor_postagem: number | null
        }
        Insert: {
          cliente_id?: string | null
          confirmado_em?: string | null
          conteudo?: string | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          id_prepostagem?: string | null
          numero_objeto?: string | null
          observacoes?: string | null
          peso_gramas?: number | null
          servico_codigo?: string
          servico_nome?: string | null
          status?: string
          updated_at?: string | null
          valor_postagem?: number | null
        }
        Update: {
          cliente_id?: string | null
          confirmado_em?: string | null
          conteudo?: string | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          id_prepostagem?: string | null
          numero_objeto?: string | null
          observacoes?: string | null
          peso_gramas?: number | null
          servico_codigo?: string
          servico_nome?: string | null
          status?: string
          updated_at?: string | null
          valor_postagem?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "envios_reversa_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "envios_destinatarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_reversa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "envios_remetentes"
            referencedColumns: ["id"]
          },
        ]
      }
      envios_telegramas: {
        Row: {
          agendamento: string | null
          clinica_sst_id: string | null
          confirmado_em: string | null
          created_at: string | null
          dest_bairro: string | null
          dest_cep: string | null
          dest_cidade: string | null
          dest_complemento: string | null
          dest_logradouro: string | null
          dest_nome: string | null
          dest_numero: string | null
          dest_uf: string | null
          destinatario_id: string | null
          id: string
          id_telegrama: string | null
          mensagem: string
          numero_objeto: string | null
          observacoes: string | null
          protocolo: string | null
          remetente_id: string | null
          status: string
          tem_cc: boolean
          tem_pc: boolean
          updated_at: string | null
          valor_postagem: number | null
        }
        Insert: {
          agendamento?: string | null
          clinica_sst_id?: string | null
          confirmado_em?: string | null
          created_at?: string | null
          dest_bairro?: string | null
          dest_cep?: string | null
          dest_cidade?: string | null
          dest_complemento?: string | null
          dest_logradouro?: string | null
          dest_nome?: string | null
          dest_numero?: string | null
          dest_uf?: string | null
          destinatario_id?: string | null
          id?: string
          id_telegrama?: string | null
          mensagem: string
          numero_objeto?: string | null
          observacoes?: string | null
          protocolo?: string | null
          remetente_id?: string | null
          status?: string
          tem_cc?: boolean
          tem_pc?: boolean
          updated_at?: string | null
          valor_postagem?: number | null
        }
        Update: {
          agendamento?: string | null
          clinica_sst_id?: string | null
          confirmado_em?: string | null
          created_at?: string | null
          dest_bairro?: string | null
          dest_cep?: string | null
          dest_cidade?: string | null
          dest_complemento?: string | null
          dest_logradouro?: string | null
          dest_nome?: string | null
          dest_numero?: string | null
          dest_uf?: string | null
          destinatario_id?: string | null
          id?: string
          id_telegrama?: string | null
          mensagem?: string
          numero_objeto?: string | null
          observacoes?: string | null
          protocolo?: string | null
          remetente_id?: string | null
          status?: string
          tem_cc?: boolean
          tem_pc?: boolean
          updated_at?: string | null
          valor_postagem?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "envios_telegramas_clinica_sst_id_fkey"
            columns: ["clinica_sst_id"]
            isOneToOne: false
            referencedRelation: "rh_clinicas_sst"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_telegramas_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "envios_destinatarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_telegramas_remetente_id_fkey"
            columns: ["remetente_id"]
            isOneToOne: false
            referencedRelation: "envios_remetentes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_administracao_usuarios: {
        Row: {
          created_at: string
          funcao: string
          id: string
          setor: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          funcao: string
          id?: string
          setor: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          funcao?: string
          id?: string
          setor?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_administracao_usuarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "app_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_administracao_usuarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_contexto_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "equipe_administracao_usuarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_usuario_modulos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      equipe_gestores_regionais: {
        Row: {
          created_at: string
          id: string
          regional: string
          supervisor_usuario_id: string | null
          suporte_usuario_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          regional: string
          supervisor_usuario_id?: string | null
          suporte_usuario_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          regional?: string
          supervisor_usuario_id?: string | null
          suporte_usuario_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_gestores_regionais_supervisor_usuario_id_fkey"
            columns: ["supervisor_usuario_id"]
            isOneToOne: false
            referencedRelation: "app_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_gestores_regionais_supervisor_usuario_id_fkey"
            columns: ["supervisor_usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_contexto_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "equipe_gestores_regionais_supervisor_usuario_id_fkey"
            columns: ["supervisor_usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_usuario_modulos"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "equipe_gestores_regionais_suporte_usuario_id_fkey"
            columns: ["suporte_usuario_id"]
            isOneToOne: false
            referencedRelation: "app_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_gestores_regionais_suporte_usuario_id_fkey"
            columns: ["suporte_usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_contexto_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "equipe_gestores_regionais_suporte_usuario_id_fkey"
            columns: ["suporte_usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_usuario_modulos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      excecoes: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          motivo: string | null
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          motivo?: string | null
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          motivo?: string | null
          nome?: string
        }
        Relationships: []
      }
      exportacoes_arquivos: {
        Row: {
          bytes_size: number
          content_base64: string
          created_at: string
          filename: string
          id: string
          job_id: string | null
          mime_type: string
          tipo: string
        }
        Insert: {
          bytes_size?: number
          content_base64: string
          created_at?: string
          filename: string
          id?: string
          job_id?: string | null
          mime_type?: string
          tipo: string
        }
        Update: {
          bytes_size?: number
          content_base64?: string
          created_at?: string
          filename?: string
          id?: string
          job_id?: string | null
          mime_type?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "exportacoes_arquivos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "exportacoes_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      exportacoes_jobs: {
        Row: {
          arquivo_id: string | null
          created_at: string
          created_by: string | null
          erro: string | null
          filtros: Json
          finished_at: string | null
          id: string
          status: string
          tipo: string
          total_registros: number
        }
        Insert: {
          arquivo_id?: string | null
          created_at?: string
          created_by?: string | null
          erro?: string | null
          filtros?: Json
          finished_at?: string | null
          id?: string
          status?: string
          tipo: string
          total_registros?: number
        }
        Update: {
          arquivo_id?: string | null
          created_at?: string
          created_by?: string | null
          erro?: string | null
          filtros?: Json
          finished_at?: string | null
          id?: string
          status?: string
          tipo?: string
          total_registros?: number
        }
        Relationships: []
      }
      faturamento_agenda: {
        Row: {
          ativo: boolean | null
          canal_envio: string | null
          cliente_id: string | null
          cliente_nome: string
          created_at: string | null
          dia_referencia: string | null
          id: string
          observacoes: string | null
          periodicidade: string | null
          proximo_envio: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          canal_envio?: string | null
          cliente_id?: string | null
          cliente_nome: string
          created_at?: string | null
          dia_referencia?: string | null
          id: string
          observacoes?: string | null
          periodicidade?: string | null
          proximo_envio?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          canal_envio?: string | null
          cliente_id?: string | null
          cliente_nome?: string
          created_at?: string | null
          dia_referencia?: string | null
          id?: string
          observacoes?: string | null
          periodicidade?: string | null
          proximo_envio?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      faturamento_clientes: {
        Row: {
          cnpj: string | null
          created_at: string | null
          email_financeiro: string | null
          id: string
          nome: string
          observacoes: string | null
          periodicidade: string | null
          prazo_pagamento_dias: number | null
          prazo_retorno_dias: number | null
          status: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string | null
          email_financeiro?: string | null
          id: string
          nome: string
          observacoes?: string | null
          periodicidade?: string | null
          prazo_pagamento_dias?: number | null
          prazo_retorno_dias?: number | null
          status?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string | null
          email_financeiro?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          periodicidade?: string | null
          prazo_pagamento_dias?: number | null
          prazo_retorno_dias?: number | null
          status?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      faturamento_documentos: {
        Row: {
          cliente_nome: string | null
          created_at: string | null
          enviado_em: string | null
          fatura_id: string | null
          id: string
          numero: string | null
          observacoes: string | null
          status: string | null
          tipo: string
          updated_at: string | null
          vencimento: string | null
        }
        Insert: {
          cliente_nome?: string | null
          created_at?: string | null
          enviado_em?: string | null
          fatura_id?: string | null
          id: string
          numero?: string | null
          observacoes?: string | null
          status?: string | null
          tipo: string
          updated_at?: string | null
          vencimento?: string | null
        }
        Update: {
          cliente_nome?: string | null
          created_at?: string | null
          enviado_em?: string | null
          fatura_id?: string | null
          id?: string
          numero?: string | null
          observacoes?: string | null
          status?: string | null
          tipo?: string
          updated_at?: string | null
          vencimento?: string | null
        }
        Relationships: []
      }
      faturamento_faturas: {
        Row: {
          canal_envio: string | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo: string | null
          created_at: string | null
          descontos: number | null
          distribuido_em: string | null
          distribuido_por_nome: string | null
          divergencia: string | null
          id: string
          observacoes: string | null
          os_abertas: number | null
          os_sem_movimento: number | null
          periodicidade: string | null
          periodo: string | null
          prazo_envio: string | null
          prazo_retorno: string | null
          prioridade: string | null
          proxima_cobranca_em: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          status: string | null
          ultimo_retorno_em: string | null
          updated_at: string | null
          valor_bruto: number | null
          valor_liquido: number | null
        }
        Insert: {
          canal_envio?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          codigo?: string | null
          created_at?: string | null
          descontos?: number | null
          distribuido_em?: string | null
          distribuido_por_nome?: string | null
          divergencia?: string | null
          id: string
          observacoes?: string | null
          os_abertas?: number | null
          os_sem_movimento?: number | null
          periodicidade?: string | null
          periodo?: string | null
          prazo_envio?: string | null
          prazo_retorno?: string | null
          prioridade?: string | null
          proxima_cobranca_em?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: string | null
          ultimo_retorno_em?: string | null
          updated_at?: string | null
          valor_bruto?: number | null
          valor_liquido?: number | null
        }
        Update: {
          canal_envio?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          codigo?: string | null
          created_at?: string | null
          descontos?: number | null
          distribuido_em?: string | null
          distribuido_por_nome?: string | null
          divergencia?: string | null
          id?: string
          observacoes?: string | null
          os_abertas?: number | null
          os_sem_movimento?: number | null
          periodicidade?: string | null
          periodo?: string | null
          prazo_envio?: string | null
          prazo_retorno?: string | null
          prioridade?: string | null
          proxima_cobranca_em?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: string | null
          ultimo_retorno_em?: string | null
          updated_at?: string | null
          valor_bruto?: number | null
          valor_liquido?: number | null
        }
        Relationships: []
      }
      faturamento_tarifas: {
        Row: {
          cliente_id: string | null
          cliente_nome: string | null
          created_at: string | null
          id: string
          servico: string
          status: string | null
          unidade: string | null
          updated_at: string | null
          valor: number | null
          vigencia: string | null
        }
        Insert: {
          cliente_id?: string | null
          cliente_nome?: string | null
          created_at?: string | null
          id: string
          servico: string
          status?: string | null
          unidade?: string | null
          updated_at?: string | null
          valor?: number | null
          vigencia?: string | null
        }
        Update: {
          cliente_id?: string | null
          cliente_nome?: string | null
          created_at?: string | null
          id?: string
          servico?: string
          status?: string | null
          unidade?: string | null
          updated_at?: string | null
          valor?: number | null
          vigencia?: string | null
        }
        Relationships: []
      }
      financeiro_adiantamentos_decisoes: {
        Row: {
          created_at: string | null
          decidido_em: string | null
          decidido_por: string | null
          execucao_id: string | null
          id: string
          motivo_recusa: string | null
          ofr_code: number
          pago_em: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          execucao_id?: string | null
          id?: string
          motivo_recusa?: string | null
          ofr_code: number
          pago_em?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          execucao_id?: string | null
          id?: string
          motivo_recusa?: string | null
          ofr_code?: number
          pago_em?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_adiantamentos_decisoes_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_pagamentos_execucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_adiantamentos_decisoes_ofr_code_fkey"
            columns: ["ofr_code"]
            isOneToOne: true
            referencedRelation: "grm_adiantamentos_importacoes"
            referencedColumns: ["ofr_code"]
          },
        ]
      }
      financeiro_alimentacao_colaboradores: {
        Row: {
          ativo: boolean
          chave_unica: string
          codigo_colaborador: string | null
          colaborador: string
          colaborador_chave: string
          coordenacao: string | null
          cpf: string | null
          created_at: string
          dados_json: Json
          data_ref: string
          distancia_m: number
          hora_identificada: string
          id: string
          latitude_colaborador: number
          local_cidade: string | null
          local_fonte_id: string | null
          local_fonte_tabela: string | null
          local_latitude: number
          local_longitude: number
          local_nome: string
          local_uf: string | null
          longitude_colaborador: number
          observacao: string | null
          origem: string
          origem_chave_login: string | null
          pontos_dentro_raio: number
          pontos_na_janela: number
          precisao_m: number | null
          processado_em: string | null
          processado_por: string | null
          raio_m: number
          status: string
          supervisao: string | null
          tipo_beneficio: string
          ultima_verificacao_em: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          ativo?: boolean
          chave_unica: string
          codigo_colaborador?: string | null
          colaborador: string
          colaborador_chave: string
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          dados_json?: Json
          data_ref: string
          distancia_m: number
          hora_identificada: string
          id?: string
          latitude_colaborador: number
          local_cidade?: string | null
          local_fonte_id?: string | null
          local_fonte_tabela?: string | null
          local_latitude: number
          local_longitude: number
          local_nome: string
          local_uf?: string | null
          longitude_colaborador: number
          observacao?: string | null
          origem?: string
          origem_chave_login?: string | null
          pontos_dentro_raio?: number
          pontos_na_janela?: number
          precisao_m?: number | null
          processado_em?: string | null
          processado_por?: string | null
          raio_m?: number
          status?: string
          supervisao?: string | null
          tipo_beneficio?: string
          ultima_verificacao_em?: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          ativo?: boolean
          chave_unica?: string
          codigo_colaborador?: string | null
          colaborador?: string
          colaborador_chave?: string
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          dados_json?: Json
          data_ref?: string
          distancia_m?: number
          hora_identificada?: string
          id?: string
          latitude_colaborador?: number
          local_cidade?: string | null
          local_fonte_id?: string | null
          local_fonte_tabela?: string | null
          local_latitude?: number
          local_longitude?: number
          local_nome?: string
          local_uf?: string | null
          longitude_colaborador?: number
          observacao?: string | null
          origem?: string
          origem_chave_login?: string | null
          pontos_dentro_raio?: number
          pontos_na_janela?: number
          precisao_m?: number | null
          processado_em?: string | null
          processado_por?: string | null
          raio_m?: number
          status?: string
          supervisao?: string | null
          tipo_beneficio?: string
          ultima_verificacao_em?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: []
      }
      financeiro_contas_pagar: {
        Row: {
          arquivo_origem: string | null
          categoria: string | null
          cnpj_cpf: string | null
          cod_grupo: string | null
          coordenacao: string | null
          data_cadastro: string | null
          data_lancamento: string | null
          doc: string | null
          empresa: string | null
          favorecido: string | null
          id: string
          identificacao: string | null
          importado_em: string
          parcela: string | null
          raw: Json
          situacao: string | null
          supervisao: string | null
          unique_hash: string
          updated_at: string
          usuario: string | null
          valor: number
          valor_pago: number
          vencimento: string | null
        }
        Insert: {
          arquivo_origem?: string | null
          categoria?: string | null
          cnpj_cpf?: string | null
          cod_grupo?: string | null
          coordenacao?: string | null
          data_cadastro?: string | null
          data_lancamento?: string | null
          doc?: string | null
          empresa?: string | null
          favorecido?: string | null
          id?: string
          identificacao?: string | null
          importado_em?: string
          parcela?: string | null
          raw?: Json
          situacao?: string | null
          supervisao?: string | null
          unique_hash: string
          updated_at?: string
          usuario?: string | null
          valor?: number
          valor_pago?: number
          vencimento?: string | null
        }
        Update: {
          arquivo_origem?: string | null
          categoria?: string | null
          cnpj_cpf?: string | null
          cod_grupo?: string | null
          coordenacao?: string | null
          data_cadastro?: string | null
          data_lancamento?: string | null
          doc?: string | null
          empresa?: string | null
          favorecido?: string | null
          id?: string
          identificacao?: string | null
          importado_em?: string
          parcela?: string | null
          raw?: Json
          situacao?: string | null
          supervisao?: string | null
          unique_hash?: string
          updated_at?: string
          usuario?: string | null
          valor?: number
          valor_pago?: number
          vencimento?: string | null
        }
        Relationships: []
      }
      financeiro_contas_receber: {
        Row: {
          arquivo_origem: string | null
          cliente: string | null
          codigo: string | null
          conta: string | null
          desconto: number
          emissao_nf: string | null
          fatura: string | null
          id: string
          importado_em: string
          juros: number
          numero_nf: string | null
          raw: Json
          recebimento: string | null
          situacao: string | null
          unique_hash: string
          updated_at: string
          valor: number
          valor_pago: number
          vencimento: string | null
        }
        Insert: {
          arquivo_origem?: string | null
          cliente?: string | null
          codigo?: string | null
          conta?: string | null
          desconto?: number
          emissao_nf?: string | null
          fatura?: string | null
          id?: string
          importado_em?: string
          juros?: number
          numero_nf?: string | null
          raw?: Json
          recebimento?: string | null
          situacao?: string | null
          unique_hash: string
          updated_at?: string
          valor?: number
          valor_pago?: number
          vencimento?: string | null
        }
        Update: {
          arquivo_origem?: string | null
          cliente?: string | null
          codigo?: string | null
          conta?: string | null
          desconto?: number
          emissao_nf?: string | null
          fatura?: string | null
          id?: string
          importado_em?: string
          juros?: number
          numero_nf?: string | null
          raw?: Json
          recebimento?: string | null
          situacao?: string | null
          unique_hash?: string
          updated_at?: string
          valor?: number
          valor_pago?: number
          vencimento?: string | null
        }
        Relationships: []
      }
      financeiro_notas_fiscais_resumo: {
        Row: {
          created_at: string
          data_pagamento: string
          destino: string
          id: string
          modulo_origem: string
          pagamento_execucao_id: string | null
          quantidade: number
          regional: string
          valor_total: number
        }
        Insert: {
          created_at?: string
          data_pagamento: string
          destino: string
          id?: string
          modulo_origem?: string
          pagamento_execucao_id?: string | null
          quantidade?: number
          regional: string
          valor_total?: number
        }
        Update: {
          created_at?: string
          data_pagamento?: string
          destino?: string
          id?: string
          modulo_origem?: string
          pagamento_execucao_id?: string | null
          quantidade?: number
          regional?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_notas_fiscais_resumo_pagamento_execucao_id_fkey"
            columns: ["pagamento_execucao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_pagamentos_execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_pagamentos: {
        Row: {
          agencia: string | null
          atualizado_por: string | null
          atualizado_por_nome: string | null
          banco: string | null
          boleto_url: string | null
          chave_pix: string | null
          competencia: string | null
          compras_item_ids: string[] | null
          comprovante_url: string | null
          conta: string | null
          contato: string | null
          conteudo: string | null
          coordenacao: string | null
          created_at: string
          dados_pagamento: string | null
          data_pagamento: string | null
          data_solicitacao: string | null
          data_vencimento: string | null
          descricao: string
          favorecido: string | null
          favorecido_documento: string | null
          favorecido_nome: string | null
          forma_pagamento: string
          fornecedor: string | null
          gestor: string | null
          hospedagem_checkout_lote_id: string | null
          id: string
          link_pagamento: string | null
          nf_numero: string | null
          nf_status: string
          nf_url: string | null
          observacao: string | null
          observacoes: string | null
          origem: string | null
          origem_codigo: string | null
          origem_id: string | null
          origem_setor: string
          origem_tabela: string
          pago_em: string | null
          pix: string | null
          prioridade: string
          setor: string | null
          solicitado_em: string | null
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          updated_at: string
          valor: number
          vencimento: string | null
        }
        Insert: {
          agencia?: string | null
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          banco?: string | null
          boleto_url?: string | null
          chave_pix?: string | null
          competencia?: string | null
          compras_item_ids?: string[] | null
          comprovante_url?: string | null
          conta?: string | null
          contato?: string | null
          conteudo?: string | null
          coordenacao?: string | null
          created_at?: string
          dados_pagamento?: string | null
          data_pagamento?: string | null
          data_solicitacao?: string | null
          data_vencimento?: string | null
          descricao: string
          favorecido?: string | null
          favorecido_documento?: string | null
          favorecido_nome?: string | null
          forma_pagamento?: string
          fornecedor?: string | null
          gestor?: string | null
          hospedagem_checkout_lote_id?: string | null
          id?: string
          link_pagamento?: string | null
          nf_numero?: string | null
          nf_status?: string
          nf_url?: string | null
          observacao?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_codigo?: string | null
          origem_id?: string | null
          origem_setor: string
          origem_tabela?: string
          pago_em?: string | null
          pix?: string | null
          prioridade?: string
          setor?: string | null
          solicitado_em?: string | null
          solicitado_por?: string | null
          solicitado_por_nome?: string | null
          status?: string
          updated_at?: string
          valor?: number
          vencimento?: string | null
        }
        Update: {
          agencia?: string | null
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          banco?: string | null
          boleto_url?: string | null
          chave_pix?: string | null
          competencia?: string | null
          compras_item_ids?: string[] | null
          comprovante_url?: string | null
          conta?: string | null
          contato?: string | null
          conteudo?: string | null
          coordenacao?: string | null
          created_at?: string
          dados_pagamento?: string | null
          data_pagamento?: string | null
          data_solicitacao?: string | null
          data_vencimento?: string | null
          descricao?: string
          favorecido?: string | null
          favorecido_documento?: string | null
          favorecido_nome?: string | null
          forma_pagamento?: string
          fornecedor?: string | null
          gestor?: string | null
          hospedagem_checkout_lote_id?: string | null
          id?: string
          link_pagamento?: string | null
          nf_numero?: string | null
          nf_status?: string
          nf_url?: string | null
          observacao?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_codigo?: string | null
          origem_id?: string | null
          origem_setor?: string
          origem_tabela?: string
          pago_em?: string | null
          pix?: string | null
          prioridade?: string
          setor?: string | null
          solicitado_em?: string | null
          solicitado_por?: string | null
          solicitado_por_nome?: string | null
          status?: string
          updated_at?: string
          valor?: number
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_pagamentos_checkout_lote_fk"
            columns: ["hospedagem_checkout_lote_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_checkout_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_pagamentos_execucoes: {
        Row: {
          api_retorno: Json | null
          created_at: string
          id: string
          periodo: string | null
          responsavel: string | null
          status: string
          tipo: string | null
          total_linhas: number
          total_valor: number
        }
        Insert: {
          api_retorno?: Json | null
          created_at?: string
          id?: string
          periodo?: string | null
          responsavel?: string | null
          status?: string
          tipo?: string | null
          total_linhas?: number
          total_valor?: number
        }
        Update: {
          api_retorno?: Json | null
          created_at?: string
          id?: string
          periodo?: string | null
          responsavel?: string | null
          status?: string
          tipo?: string | null
          total_linhas?: number
          total_valor?: number
        }
        Relationships: []
      }
      financeiro_pagamentos_historico: {
        Row: {
          created_at: string
          id: string
          observacao: string | null
          pagamento_id: string
          status_anterior: string | null
          status_novo: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          observacao?: string | null
          pagamento_id: string
          status_anterior?: string | null
          status_novo?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          observacao?: string | null
          pagamento_id?: string
          status_anterior?: string | null
          status_novo?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_pagamentos_historico_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_pagamentos_linhas: {
        Row: {
          api_retorno: Json | null
          banco: string | null
          composicao: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string
          data: string | null
          destino: string | null
          execucao_id: string | null
          funcionario: string | null
          id: string
          observacao: string | null
          pago_em: string | null
          status: string
          supervisao: string | null
          tipo: string | null
          unique_hash: string
          valor: number
        }
        Insert: {
          api_retorno?: Json | null
          banco?: string | null
          composicao?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          data?: string | null
          destino?: string | null
          execucao_id?: string | null
          funcionario?: string | null
          id?: string
          observacao?: string | null
          pago_em?: string | null
          status?: string
          supervisao?: string | null
          tipo?: string | null
          unique_hash: string
          valor?: number
        }
        Update: {
          api_retorno?: Json | null
          banco?: string | null
          composicao?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          data?: string | null
          destino?: string | null
          execucao_id?: string | null
          funcionario?: string | null
          id?: string
          observacao?: string | null
          pago_em?: string | null
          status?: string
          supervisao?: string | null
          tipo?: string | null
          unique_hash?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_pagamentos_linhas_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_pagamentos_execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_provisoes: {
        Row: {
          ajuste_manual: number
          created_at: string
          data: string
          descricao: string | null
          id: string
          observacoes: string | null
          responsavel: string | null
          updated_at: string
          valor_automatico: number
          valor_final: number | null
        }
        Insert: {
          ajuste_manual?: number
          created_at?: string
          data: string
          descricao?: string | null
          id?: string
          observacoes?: string | null
          responsavel?: string | null
          updated_at?: string
          valor_automatico?: number
          valor_final?: number | null
        }
        Update: {
          ajuste_manual?: number
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          observacoes?: string | null
          responsavel?: string | null
          updated_at?: string
          valor_automatico?: number
          valor_final?: number | null
        }
        Relationships: []
      }
      financeiro_saldos_dia: {
        Row: {
          created_at: string
          data: string
          id: string
          observacoes: string | null
          responsavel: string | null
          saldo_dia: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: string
          id?: string
          observacoes?: string | null
          responsavel?: string | null
          saldo_dia?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          observacoes?: string | null
          responsavel?: string | null
          saldo_dia?: number
          updated_at?: string
        }
        Relationships: []
      }
      frota_solicitacoes: {
        Row: {
          colaborador_id: string | null
          colaborador_nome: string | null
          created_at: string
          descricao: string | null
          id: string
          metadata: Json
          origem: string
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          metadata?: Json
          origem?: string
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          metadata?: Json
          origem?: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      frotas_bfleet_condutores_fila: {
        Row: {
          atualizado_em: string | null
          created_at: string
          erro: string | null
          id: string
          motorista_atual: string | null
          patrimonio_codigo: string | null
          placa: string | null
          status: string
          tentativas: number
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          atualizado_em?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          motorista_atual?: string | null
          patrimonio_codigo?: string | null
          placa?: string | null
          status?: string
          tentativas?: number
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          atualizado_em?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          motorista_atual?: string | null
          patrimonio_codigo?: string | null
          placa?: string | null
          status?: string
          tentativas?: number
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: []
      }
      frotas_bfleet_diagnostico: {
        Row: {
          created_at: string
          dados: Json | null
          empresa: string | null
          grupo_bfleet: string | null
          id: string
          idgps: string | null
          motivo: string | null
          nome_bfleet: string | null
          placa: string | null
          renavam: string | null
          sync_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          dados?: Json | null
          empresa?: string | null
          grupo_bfleet?: string | null
          id?: string
          idgps?: string | null
          motivo?: string | null
          nome_bfleet?: string | null
          placa?: string | null
          renavam?: string | null
          sync_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          dados?: Json | null
          empresa?: string | null
          grupo_bfleet?: string | null
          id?: string
          idgps?: string | null
          motivo?: string | null
          nome_bfleet?: string | null
          placa?: string | null
          renavam?: string | null
          sync_id?: string
          tipo?: string
        }
        Relationships: []
      }
      frotas_bfleet_sincronizacoes: {
        Row: {
          criado_em: string
          divergencias: number | null
          id: string
          payload: Json | null
          rastreadores: number | null
          total_bfleet: number | null
        }
        Insert: {
          criado_em?: string
          divergencias?: number | null
          id?: string
          payload?: Json | null
          rastreadores?: number | null
          total_bfleet?: number | null
        }
        Update: {
          criado_em?: string
          divergencias?: number | null
          id?: string
          payload?: Json | null
          rastreadores?: number | null
          total_bfleet?: number | null
        }
        Relationships: []
      }
      frotas_bfleet_sync_logs: {
        Row: {
          acao: string | null
          created_at: string | null
          id: number
          mensagem: string | null
          payload: Json | null
          placa: string | null
          resposta: Json | null
          status: string | null
          veiculo_id: string | null
        }
        Insert: {
          acao?: string | null
          created_at?: string | null
          id?: number
          mensagem?: string | null
          payload?: Json | null
          placa?: string | null
          resposta?: Json | null
          status?: string | null
          veiculo_id?: string | null
        }
        Update: {
          acao?: string | null
          created_at?: string | null
          id?: number
          mensagem?: string | null
          payload?: Json | null
          placa?: string | null
          resposta?: Json | null
          status?: string | null
          veiculo_id?: string | null
        }
        Relationships: []
      }
      frotas_checklists: {
        Row: {
          anexo_url: string | null
          aprovado: boolean | null
          created_at: string
          criado_por: string | null
          data_execucao: string
          id: string
          itens: Json
          km_execucao: number | null
          observacoes: string | null
          proxima_data: string | null
          responsavel: string | null
          updated_at: string
          veiculo_id: string
        }
        Insert: {
          anexo_url?: string | null
          aprovado?: boolean | null
          created_at?: string
          criado_por?: string | null
          data_execucao?: string
          id?: string
          itens?: Json
          km_execucao?: number | null
          observacoes?: string | null
          proxima_data?: string | null
          responsavel?: string | null
          updated_at?: string
          veiculo_id: string
        }
        Update: {
          anexo_url?: string | null
          aprovado?: boolean | null
          created_at?: string
          criado_por?: string | null
          data_execucao?: string
          id?: string
          itens?: Json
          km_execucao?: number | null
          observacoes?: string | null
          proxima_data?: string | null
          responsavel?: string | null
          updated_at?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "frotas_checklists_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "frotas_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_detran_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          chave_nome: string
          chave_valor: string | null
          cnpj: string | null
          criado_em: string
          empresa: string | null
          id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          chave_nome: string
          chave_valor?: string | null
          cnpj?: string | null
          criado_em?: string
          empresa?: string | null
          id?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          chave_nome?: string
          chave_valor?: string | null
          cnpj?: string | null
          criado_em?: string
          empresa?: string | null
          id?: string
        }
        Relationships: []
      }
      frotas_excesso_velocidade: {
        Row: {
          alerta: string | null
          arquivo_nome: string | null
          ativo_rastreador: string | null
          bfleet_ativo_nome: string | null
          bfleet_report_id: string | null
          bfleet_vehicle_id: string | null
          coordenacao: string | null
          created_at: string
          data_evento: string
          endereco: string | null
          hora_evento: string | null
          id: string
          import_hash: string
          latitude: number | null
          longitude: number | null
          mapa_url: string | null
          mensagem_gerada: string | null
          motorista_planilha: string | null
          notificado_em: string | null
          notificado_por: string | null
          notificado_por_nome: string | null
          observacoes: string | null
          origem: string
          patrimonio_codigo: string | null
          patrimonio_funcionario: string | null
          patrimonio_id: string | null
          patrimonio_identificacao: string | null
          placa: string
          raw: Json | null
          status_cruzamento: string
          status_notificacao: string
          supervisao: string | null
          updated_at: string
          velocidade: number
        }
        Insert: {
          alerta?: string | null
          arquivo_nome?: string | null
          ativo_rastreador?: string | null
          bfleet_ativo_nome?: string | null
          bfleet_report_id?: string | null
          bfleet_vehicle_id?: string | null
          coordenacao?: string | null
          created_at?: string
          data_evento: string
          endereco?: string | null
          hora_evento?: string | null
          id?: string
          import_hash: string
          latitude?: number | null
          longitude?: number | null
          mapa_url?: string | null
          mensagem_gerada?: string | null
          motorista_planilha?: string | null
          notificado_em?: string | null
          notificado_por?: string | null
          notificado_por_nome?: string | null
          observacoes?: string | null
          origem?: string
          patrimonio_codigo?: string | null
          patrimonio_funcionario?: string | null
          patrimonio_id?: string | null
          patrimonio_identificacao?: string | null
          placa: string
          raw?: Json | null
          status_cruzamento?: string
          status_notificacao?: string
          supervisao?: string | null
          updated_at?: string
          velocidade: number
        }
        Update: {
          alerta?: string | null
          arquivo_nome?: string | null
          ativo_rastreador?: string | null
          bfleet_ativo_nome?: string | null
          bfleet_report_id?: string | null
          bfleet_vehicle_id?: string | null
          coordenacao?: string | null
          created_at?: string
          data_evento?: string
          endereco?: string | null
          hora_evento?: string | null
          id?: string
          import_hash?: string
          latitude?: number | null
          longitude?: number | null
          mapa_url?: string | null
          mensagem_gerada?: string | null
          motorista_planilha?: string | null
          notificado_em?: string | null
          notificado_por?: string | null
          notificado_por_nome?: string | null
          observacoes?: string | null
          origem?: string
          patrimonio_codigo?: string | null
          patrimonio_funcionario?: string | null
          patrimonio_id?: string | null
          patrimonio_identificacao?: string | null
          placa?: string
          raw?: Json | null
          status_cruzamento?: string
          status_notificacao?: string
          supervisao?: string | null
          updated_at?: string
          velocidade?: number
        }
        Relationships: []
      }
      frotas_feriados: {
        Row: {
          criado_em: string
          data: string
          escopo: string
          nome: string
        }
        Insert: {
          criado_em?: string
          data: string
          escopo?: string
          nome: string
        }
        Update: {
          criado_em?: string
          data?: string
          escopo?: string
          nome?: string
        }
        Relationships: []
      }
      frotas_fora_horario: {
        Row: {
          alerta: string | null
          arquivo_nome: string | null
          ativo_rastreador: string | null
          bfleet_ativo_nome: string | null
          bfleet_report_id: string | null
          bfleet_vehicle_id: string | null
          coordenacao: string | null
          created_at: string
          data_evento: string
          endereco: string | null
          hora_evento: string | null
          id: string
          import_hash: string
          latitude: number | null
          longitude: number | null
          mapa_url: string | null
          motorista_planilha: string | null
          observacoes: string | null
          origem: string
          patrimonio_codigo: string | null
          patrimonio_funcionario: string | null
          patrimonio_id: string | null
          patrimonio_identificacao: string | null
          placa: string
          raw: Json | null
          status_cruzamento: string
          supervisao: string | null
          updated_at: string
        }
        Insert: {
          alerta?: string | null
          arquivo_nome?: string | null
          ativo_rastreador?: string | null
          bfleet_ativo_nome?: string | null
          bfleet_report_id?: string | null
          bfleet_vehicle_id?: string | null
          coordenacao?: string | null
          created_at?: string
          data_evento: string
          endereco?: string | null
          hora_evento?: string | null
          id?: string
          import_hash: string
          latitude?: number | null
          longitude?: number | null
          mapa_url?: string | null
          motorista_planilha?: string | null
          observacoes?: string | null
          origem?: string
          patrimonio_codigo?: string | null
          patrimonio_funcionario?: string | null
          patrimonio_id?: string | null
          patrimonio_identificacao?: string | null
          placa: string
          raw?: Json | null
          status_cruzamento?: string
          supervisao?: string | null
          updated_at?: string
        }
        Update: {
          alerta?: string | null
          arquivo_nome?: string | null
          ativo_rastreador?: string | null
          bfleet_ativo_nome?: string | null
          bfleet_report_id?: string | null
          bfleet_vehicle_id?: string | null
          coordenacao?: string | null
          created_at?: string
          data_evento?: string
          endereco?: string | null
          hora_evento?: string | null
          id?: string
          import_hash?: string
          latitude?: number | null
          longitude?: number | null
          mapa_url?: string | null
          motorista_planilha?: string | null
          observacoes?: string | null
          origem?: string
          patrimonio_codigo?: string | null
          patrimonio_funcionario?: string | null
          patrimonio_id?: string | null
          patrimonio_identificacao?: string | null
          placa?: string
          raw?: Json | null
          status_cruzamento?: string
          supervisao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      frotas_fora_horario_caixa_lancamentos: {
        Row: {
          colaborador_nome: string
          data_evento: string
          descricao: string
          grm_retorno: Json | null
          id: string
          iniciado_em: string | null
          km_00_05: number
          nome_normalizado: string
          ocorrencia_id: string
          placa: string
          processado_em: string | null
          solicitado_em: string
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
          valor: number
          valor_km: number
        }
        Insert: {
          colaborador_nome: string
          data_evento: string
          descricao: string
          grm_retorno?: Json | null
          id?: string
          iniciado_em?: string | null
          km_00_05: number
          nome_normalizado: string
          ocorrencia_id: string
          placa: string
          processado_em?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          solicitado_por_nome?: string | null
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
          valor: number
          valor_km?: number
        }
        Update: {
          colaborador_nome?: string
          data_evento?: string
          descricao?: string
          grm_retorno?: Json | null
          id?: string
          iniciado_em?: string | null
          km_00_05?: number
          nome_normalizado?: string
          ocorrencia_id?: string
          placa?: string
          processado_em?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          solicitado_por_nome?: string | null
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
          valor?: number
          valor_km?: number
        }
        Relationships: [
          {
            foreignKeyName: "frotas_fora_horario_caixa_lancamentos_ocorrencia_id_fkey"
            columns: ["ocorrencia_id"]
            isOneToOne: true
            referencedRelation: "frotas_fora_horario_ocorrencias"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_fora_horario_dossie: {
        Row: {
          atraso_retorno_min: number | null
          calculado_em: string
          caronas: Json
          chegada_casa: string | null
          condutor_escalado: string | null
          confianca: string
          coordenacao: string | null
          criterio: string
          data_evento: string
          detalhes: Json
          excessos_fora: number
          fim_expediente: string | null
          fonte_expediente: string | null
          id: string
          inicio_expediente: string | null
          janela_fim: string | null
          janela_inicio: string | null
          km_apos_chegada: number
          km_dia: number
          km_fora: number
          km_indevido: number
          km_noturno: number
          min_fora: number
          motivos: Json
          motorista: string | null
          placa: string
          primeiro_informativo: string | null
          qtd_excessos: number
          qtd_informativos: number
          resumo_dia: Json
          retorno_previsto: string | null
          saida_casa: string | null
          supervisao: string | null
          tolerancia_min: number
          ultimo_informativo: string | null
          uso_sem_base: boolean
          vel_max: number | null
          veredito: string
          veredito_uso: string
          viagens_dia: number
          viagens_fora: number
          viagens_indevidas: number
        }
        Insert: {
          atraso_retorno_min?: number | null
          calculado_em?: string
          caronas?: Json
          chegada_casa?: string | null
          condutor_escalado?: string | null
          confianca: string
          coordenacao?: string | null
          criterio: string
          data_evento: string
          detalhes?: Json
          excessos_fora?: number
          fim_expediente?: string | null
          fonte_expediente?: string | null
          id?: string
          inicio_expediente?: string | null
          janela_fim?: string | null
          janela_inicio?: string | null
          km_apos_chegada?: number
          km_dia?: number
          km_fora?: number
          km_indevido?: number
          km_noturno?: number
          min_fora?: number
          motivos?: Json
          motorista?: string | null
          placa: string
          primeiro_informativo?: string | null
          qtd_excessos?: number
          qtd_informativos?: number
          resumo_dia?: Json
          retorno_previsto?: string | null
          saida_casa?: string | null
          supervisao?: string | null
          tolerancia_min?: number
          ultimo_informativo?: string | null
          uso_sem_base?: boolean
          vel_max?: number | null
          veredito: string
          veredito_uso?: string
          viagens_dia?: number
          viagens_fora?: number
          viagens_indevidas?: number
        }
        Update: {
          atraso_retorno_min?: number | null
          calculado_em?: string
          caronas?: Json
          chegada_casa?: string | null
          condutor_escalado?: string | null
          confianca?: string
          coordenacao?: string | null
          criterio?: string
          data_evento?: string
          detalhes?: Json
          excessos_fora?: number
          fim_expediente?: string | null
          fonte_expediente?: string | null
          id?: string
          inicio_expediente?: string | null
          janela_fim?: string | null
          janela_inicio?: string | null
          km_apos_chegada?: number
          km_dia?: number
          km_fora?: number
          km_indevido?: number
          km_noturno?: number
          min_fora?: number
          motivos?: Json
          motorista?: string | null
          placa?: string
          primeiro_informativo?: string | null
          qtd_excessos?: number
          qtd_informativos?: number
          resumo_dia?: Json
          retorno_previsto?: string | null
          saida_casa?: string | null
          supervisao?: string | null
          tolerancia_min?: number
          ultimo_informativo?: string | null
          uso_sem_base?: boolean
          vel_max?: number | null
          veredito?: string
          veredito_uso?: string
          viagens_dia?: number
          viagens_fora?: number
          viagens_indevidas?: number
        }
        Relationships: []
      }
      frotas_fora_horario_ocorrencias: {
        Row: {
          caixa_lancamento_id: string | null
          caixa_solicitado_em: string | null
          caixa_solicitado_por: string | null
          caixa_solicitado_por_nome: string | null
          calculo_detalhes: Json
          coordenacao: string | null
          created_at: string
          data_evento: string
          endereco_fim: string | null
          endereco_inicio: string | null
          fonte_calculo: string | null
          gerado_em: string | null
          gerado_por: string | null
          gerado_por_nome: string | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          justificado_em: string | null
          justificado_por: string | null
          justificado_por_nome: string | null
          justificativa: string | null
          km_00_05: number
          latitude_fim: number | null
          latitude_inicio: number | null
          longitude_fim: number | null
          longitude_inicio: number | null
          mapa_url: string | null
          mensagem_gerada: string | null
          motorista: string | null
          patrimonio_codigo: string | null
          patrimonio_id: string | null
          placa: string
          status_caixa: string
          status_calculo: string
          status_notificacao: string
          supervisao: string | null
          updated_at: string
          valor_caixa: number | null
          valor_km: number
        }
        Insert: {
          caixa_lancamento_id?: string | null
          caixa_solicitado_em?: string | null
          caixa_solicitado_por?: string | null
          caixa_solicitado_por_nome?: string | null
          calculo_detalhes?: Json
          coordenacao?: string | null
          created_at?: string
          data_evento: string
          endereco_fim?: string | null
          endereco_inicio?: string | null
          fonte_calculo?: string | null
          gerado_em?: string | null
          gerado_por?: string | null
          gerado_por_nome?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          justificado_em?: string | null
          justificado_por?: string | null
          justificado_por_nome?: string | null
          justificativa?: string | null
          km_00_05?: number
          latitude_fim?: number | null
          latitude_inicio?: number | null
          longitude_fim?: number | null
          longitude_inicio?: number | null
          mapa_url?: string | null
          mensagem_gerada?: string | null
          motorista?: string | null
          patrimonio_codigo?: string | null
          patrimonio_id?: string | null
          placa: string
          status_caixa?: string
          status_calculo?: string
          status_notificacao?: string
          supervisao?: string | null
          updated_at?: string
          valor_caixa?: number | null
          valor_km?: number
        }
        Update: {
          caixa_lancamento_id?: string | null
          caixa_solicitado_em?: string | null
          caixa_solicitado_por?: string | null
          caixa_solicitado_por_nome?: string | null
          calculo_detalhes?: Json
          coordenacao?: string | null
          created_at?: string
          data_evento?: string
          endereco_fim?: string | null
          endereco_inicio?: string | null
          fonte_calculo?: string | null
          gerado_em?: string | null
          gerado_por?: string | null
          gerado_por_nome?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          justificado_em?: string | null
          justificado_por?: string | null
          justificado_por_nome?: string | null
          justificativa?: string | null
          km_00_05?: number
          latitude_fim?: number | null
          latitude_inicio?: number | null
          longitude_fim?: number | null
          longitude_inicio?: number | null
          mapa_url?: string | null
          mensagem_gerada?: string | null
          motorista?: string | null
          patrimonio_codigo?: string | null
          patrimonio_id?: string | null
          placa?: string
          status_caixa?: string
          status_calculo?: string
          status_notificacao?: string
          supervisao?: string | null
          updated_at?: string
          valor_caixa?: number | null
          valor_km?: number
        }
        Relationships: []
      }
      frotas_fora_horario_rota: {
        Row: {
          data_evento: string
          gerado_em: string
          idgps: string | null
          placa: string
          pontos: Json
          total_original: number | null
        }
        Insert: {
          data_evento: string
          gerado_em?: string
          idgps?: string | null
          placa: string
          pontos: Json
          total_original?: number | null
        }
        Update: {
          data_evento?: string
          gerado_em?: string
          idgps?: string | null
          placa?: string
          pontos?: Json
          total_original?: number | null
        }
        Relationships: []
      }
      frotas_fora_horario_sync_dia: {
        Row: {
          atualizado_em: string
          data_evento: string
          dossie_em: string | null
          dossies: number
          ocorrencias: number
          passada_tardia_em: string | null
          placas_raw: number
          sincronizado_em: string | null
          status: string
          tentativa_data: string | null
          tentativas_hoje: number
          tentativas_total: number
          ultima_tentativa: string | null
          ultimo_erro: string | null
        }
        Insert: {
          atualizado_em?: string
          data_evento: string
          dossie_em?: string | null
          dossies?: number
          ocorrencias?: number
          passada_tardia_em?: string | null
          placas_raw?: number
          sincronizado_em?: string | null
          status?: string
          tentativa_data?: string | null
          tentativas_hoje?: number
          tentativas_total?: number
          ultima_tentativa?: string | null
          ultimo_erro?: string | null
        }
        Update: {
          atualizado_em?: string
          data_evento?: string
          dossie_em?: string | null
          dossies?: number
          ocorrencias?: number
          passada_tardia_em?: string | null
          placas_raw?: number
          sincronizado_em?: string | null
          status?: string
          tentativa_data?: string | null
          tentativas_hoje?: number
          tentativas_total?: number
          ultima_tentativa?: string | null
          ultimo_erro?: string | null
        }
        Relationships: []
      }
      frotas_gps_ocorrencias: {
        Row: {
          atualizado_por: string | null
          conclusao: string | null
          created_at: string
          criado_por: string | null
          detalhes: Json | null
          detectada_em: string
          id: string
          justificativa: string | null
          placa: string
          responsavel: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          atualizado_por?: string | null
          conclusao?: string | null
          created_at?: string
          criado_por?: string | null
          detalhes?: Json | null
          detectada_em?: string
          id?: string
          justificativa?: string | null
          placa: string
          responsavel?: string | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          atualizado_por?: string | null
          conclusao?: string | null
          created_at?: string
          criado_por?: string | null
          detalhes?: Json | null
          detectada_em?: string
          id?: string
          justificativa?: string | null
          placa?: string
          responsavel?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      frotas_manutencoes: {
        Row: {
          anexo_url: string | null
          created_at: string
          criado_por: string | null
          custo: number | null
          data_execucao: string
          descricao: string | null
          id: string
          km_execucao: number | null
          observacoes: string | null
          oficina: string | null
          proxima_data: string | null
          proxima_km: number | null
          tipo_servico: string | null
          updated_at: string
          veiculo_id: string
        }
        Insert: {
          anexo_url?: string | null
          created_at?: string
          criado_por?: string | null
          custo?: number | null
          data_execucao?: string
          descricao?: string | null
          id?: string
          km_execucao?: number | null
          observacoes?: string | null
          oficina?: string | null
          proxima_data?: string | null
          proxima_km?: number | null
          tipo_servico?: string | null
          updated_at?: string
          veiculo_id: string
        }
        Update: {
          anexo_url?: string | null
          created_at?: string
          criado_por?: string | null
          custo?: number | null
          data_execucao?: string
          descricao?: string | null
          id?: string
          km_execucao?: number | null
          observacoes?: string | null
          oficina?: string | null
          proxima_data?: string | null
          proxima_km?: number | null
          tipo_servico?: string | null
          updated_at?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "frotas_manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "frotas_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_motoristas: {
        Row: {
          bfleet_conductor_id: string | null
          bfleet_sync_erro: string | null
          bfleet_sync_status: string | null
          bfleet_ultima_sync_em: string | null
          cnh_numero: string | null
          cnh_validade: string | null
          colaborador_nome: string | null
          cpf: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          matricula: string | null
          nome: string
          observacoes: string | null
          origem: string
          status: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          bfleet_conductor_id?: string | null
          bfleet_sync_erro?: string | null
          bfleet_sync_status?: string | null
          bfleet_ultima_sync_em?: string | null
          cnh_numero?: string | null
          cnh_validade?: string | null
          colaborador_nome?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          matricula?: string | null
          nome: string
          observacoes?: string | null
          origem?: string
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          bfleet_conductor_id?: string | null
          bfleet_sync_erro?: string | null
          bfleet_sync_status?: string | null
          bfleet_ultima_sync_em?: string | null
          cnh_numero?: string | null
          cnh_validade?: string | null
          colaborador_nome?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          matricula?: string | null
          nome?: string
          observacoes?: string | null
          origem?: string
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      frotas_multas: {
        Row: {
          acao_status: string | null
          arquivada_em: string | null
          arquivada_por: string | null
          arquivo_pdf_url: string | null
          atualizado_em: string
          auto: string | null
          cnpj: string | null
          cod_auto: string | null
          cod_orgao: string | null
          condutor_identificado_em: string | null
          condutor_notificado_em: string | null
          created_at: string
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          data_infracao: string | null
          data_limite_cetran: string | null
          data_limite_defesa: string | null
          data_limite_jari: string | null
          data_limite_pagto: string | null
          data_vencimento: string | null
          data_vencimento_auto: string | null
          descricao: string | null
          dobrada_em: string | null
          dobrada_obs: string | null
          dobrada_por: string | null
          dobrar_solicitado_em: string | null
          empresa: string | null
          grupo_id: string | null
          guia_url: string | null
          hora: string | null
          hora_infracao: string | null
          id: string
          identificada_em: string | null
          identificada_obs: string | null
          identificada_por: string | null
          identificar_solicitado_em: string | null
          import_hash: string | null
          indicar_condutor_msg: string | null
          key: string | null
          local: string | null
          mensagem_gerada: string | null
          motivo_arquivamento: string | null
          motorista: string | null
          motorista_cpf: string | null
          motorista_definido_em: string | null
          motorista_em: string | null
          motorista_nome: string | null
          motorista_por: string | null
          multa_dobrada_em: string | null
          multa_indicada_em: string | null
          multa_key: string | null
          notificado_em: string | null
          notificado_por: string | null
          notificado_por_nome: string | null
          numero_auto_infracao: string | null
          observacoes_operacionais: string | null
          ok_em: string | null
          ok_observacao: string | null
          ok_por: string | null
          orgao_autuador: string | null
          orgao_competente: string | null
          origem: string
          parcelas: string | null
          placa: string
          pode_indicar_condutor: string | null
          raw: Json
          renavam: string | null
          respondido_em: string | null
          situacao: string | null
          status_multa: string
          status_notificacao: string
          termo_gerado_em: string | null
          termo_gerado_por_nome: string | null
          ultima_consulta_em: string | null
          updated_at: string
          valor_original: number | null
          veiculo_id: string | null
        }
        Insert: {
          acao_status?: string | null
          arquivada_em?: string | null
          arquivada_por?: string | null
          arquivo_pdf_url?: string | null
          atualizado_em?: string
          auto?: string | null
          cnpj?: string | null
          cod_auto?: string | null
          cod_orgao?: string | null
          condutor_identificado_em?: string | null
          condutor_notificado_em?: string | null
          created_at?: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_infracao?: string | null
          data_limite_cetran?: string | null
          data_limite_defesa?: string | null
          data_limite_jari?: string | null
          data_limite_pagto?: string | null
          data_vencimento?: string | null
          data_vencimento_auto?: string | null
          descricao?: string | null
          dobrada_em?: string | null
          dobrada_obs?: string | null
          dobrada_por?: string | null
          dobrar_solicitado_em?: string | null
          empresa?: string | null
          grupo_id?: string | null
          guia_url?: string | null
          hora?: string | null
          hora_infracao?: string | null
          id?: string
          identificada_em?: string | null
          identificada_obs?: string | null
          identificada_por?: string | null
          identificar_solicitado_em?: string | null
          import_hash?: string | null
          indicar_condutor_msg?: string | null
          key?: string | null
          local?: string | null
          mensagem_gerada?: string | null
          motivo_arquivamento?: string | null
          motorista?: string | null
          motorista_cpf?: string | null
          motorista_definido_em?: string | null
          motorista_em?: string | null
          motorista_nome?: string | null
          motorista_por?: string | null
          multa_dobrada_em?: string | null
          multa_indicada_em?: string | null
          multa_key?: string | null
          notificado_em?: string | null
          notificado_por?: string | null
          notificado_por_nome?: string | null
          numero_auto_infracao?: string | null
          observacoes_operacionais?: string | null
          ok_em?: string | null
          ok_observacao?: string | null
          ok_por?: string | null
          orgao_autuador?: string | null
          orgao_competente?: string | null
          origem?: string
          parcelas?: string | null
          placa: string
          pode_indicar_condutor?: string | null
          raw?: Json
          renavam?: string | null
          respondido_em?: string | null
          situacao?: string | null
          status_multa?: string
          status_notificacao?: string
          termo_gerado_em?: string | null
          termo_gerado_por_nome?: string | null
          ultima_consulta_em?: string | null
          updated_at?: string
          valor_original?: number | null
          veiculo_id?: string | null
        }
        Update: {
          acao_status?: string | null
          arquivada_em?: string | null
          arquivada_por?: string | null
          arquivo_pdf_url?: string | null
          atualizado_em?: string
          auto?: string | null
          cnpj?: string | null
          cod_auto?: string | null
          cod_orgao?: string | null
          condutor_identificado_em?: string | null
          condutor_notificado_em?: string | null
          created_at?: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_infracao?: string | null
          data_limite_cetran?: string | null
          data_limite_defesa?: string | null
          data_limite_jari?: string | null
          data_limite_pagto?: string | null
          data_vencimento?: string | null
          data_vencimento_auto?: string | null
          descricao?: string | null
          dobrada_em?: string | null
          dobrada_obs?: string | null
          dobrada_por?: string | null
          dobrar_solicitado_em?: string | null
          empresa?: string | null
          grupo_id?: string | null
          guia_url?: string | null
          hora?: string | null
          hora_infracao?: string | null
          id?: string
          identificada_em?: string | null
          identificada_obs?: string | null
          identificada_por?: string | null
          identificar_solicitado_em?: string | null
          import_hash?: string | null
          indicar_condutor_msg?: string | null
          key?: string | null
          local?: string | null
          mensagem_gerada?: string | null
          motivo_arquivamento?: string | null
          motorista?: string | null
          motorista_cpf?: string | null
          motorista_definido_em?: string | null
          motorista_em?: string | null
          motorista_nome?: string | null
          motorista_por?: string | null
          multa_dobrada_em?: string | null
          multa_indicada_em?: string | null
          multa_key?: string | null
          notificado_em?: string | null
          notificado_por?: string | null
          notificado_por_nome?: string | null
          numero_auto_infracao?: string | null
          observacoes_operacionais?: string | null
          ok_em?: string | null
          ok_observacao?: string | null
          ok_por?: string | null
          orgao_autuador?: string | null
          orgao_competente?: string | null
          origem?: string
          parcelas?: string | null
          placa?: string
          pode_indicar_condutor?: string | null
          raw?: Json
          renavam?: string | null
          respondido_em?: string | null
          situacao?: string | null
          status_multa?: string
          status_notificacao?: string
          termo_gerado_em?: string | null
          termo_gerado_por_nome?: string | null
          ultima_consulta_em?: string | null
          updated_at?: string
          valor_original?: number | null
          veiculo_id?: string | null
        }
        Relationships: []
      }
      frotas_multas_acoes: {
        Row: {
          acao: string
          created_at: string
          detalhe: Json | null
          id: string
          multa_id: string
          usuario: string
        }
        Insert: {
          acao: string
          created_at?: string
          detalhe?: Json | null
          id?: string
          multa_id: string
          usuario: string
        }
        Update: {
          acao?: string
          created_at?: string
          detalhe?: Json | null
          id?: string
          multa_id?: string
          usuario?: string
        }
        Relationships: []
      }
      frotas_multas_anexos: {
        Row: {
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          dossie_id: string | null
          drive_enviado_em: string | null
          drive_file_id: string | null
          drive_pasta: string | null
          drive_url: string | null
          id: string
          mime_type: string | null
          multa_id: string | null
          nome_arquivo: string | null
          storage_bucket: string
          storage_path: string
          tamanho_bytes: number | null
          tipo: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          dossie_id?: string | null
          drive_enviado_em?: string | null
          drive_file_id?: string | null
          drive_pasta?: string | null
          drive_url?: string | null
          id?: string
          mime_type?: string | null
          multa_id?: string | null
          nome_arquivo?: string | null
          storage_bucket?: string
          storage_path: string
          tamanho_bytes?: number | null
          tipo: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          dossie_id?: string | null
          drive_enviado_em?: string | null
          drive_file_id?: string | null
          drive_pasta?: string | null
          drive_url?: string | null
          id?: string
          mime_type?: string | null
          multa_id?: string | null
          nome_arquivo?: string | null
          storage_bucket?: string
          storage_path?: string
          tamanho_bytes?: number | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "frotas_multas_anexos_multa_id_fkey"
            columns: ["multa_id"]
            isOneToOne: false
            referencedRelation: "frotas_multas"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_multas_arquivos: {
        Row: {
          arquivo_pdf_id: string | null
          arquivo_pdf_nome: string | null
          arquivo_pdf_url: string | null
          chave_tecnica: string | null
          cod_auto: string | null
          cod_orgao: string | null
          criado_em: string
          data_infracao: string | null
          descricao: string | null
          erro: string | null
          guia_codigo_barras_grd: string | null
          guia_data_vencimento_grd: string | null
          guia_pix_copia_cola: string | null
          guia_valor_grd: number | null
          id: string
          linha_multas: number | null
          multa_id: string | null
          placa: string | null
          raw: Json
          status: string | null
        }
        Insert: {
          arquivo_pdf_id?: string | null
          arquivo_pdf_nome?: string | null
          arquivo_pdf_url?: string | null
          chave_tecnica?: string | null
          cod_auto?: string | null
          cod_orgao?: string | null
          criado_em?: string
          data_infracao?: string | null
          descricao?: string | null
          erro?: string | null
          guia_codigo_barras_grd?: string | null
          guia_data_vencimento_grd?: string | null
          guia_pix_copia_cola?: string | null
          guia_valor_grd?: number | null
          id?: string
          linha_multas?: number | null
          multa_id?: string | null
          placa?: string | null
          raw?: Json
          status?: string | null
        }
        Update: {
          arquivo_pdf_id?: string | null
          arquivo_pdf_nome?: string | null
          arquivo_pdf_url?: string | null
          chave_tecnica?: string | null
          cod_auto?: string | null
          cod_orgao?: string | null
          criado_em?: string
          data_infracao?: string | null
          descricao?: string | null
          erro?: string | null
          guia_codigo_barras_grd?: string | null
          guia_data_vencimento_grd?: string | null
          guia_pix_copia_cola?: string | null
          guia_valor_grd?: number | null
          id?: string
          linha_multas?: number | null
          multa_id?: string | null
          placa?: string | null
          raw?: Json
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "frotas_multas_arquivos_multa_id_fkey"
            columns: ["multa_id"]
            isOneToOne: false
            referencedRelation: "frotas_multas"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_multas_logs: {
        Row: {
          acao: string | null
          criado_em: string
          detalhe: string | null
          id: string
          key_multa: string | null
          multa_id: string | null
          payload: Json
          status: string | null
          subscriber_id: string | null
          telefone: string | null
        }
        Insert: {
          acao?: string | null
          criado_em?: string
          detalhe?: string | null
          id?: string
          key_multa?: string | null
          multa_id?: string | null
          payload?: Json
          status?: string | null
          subscriber_id?: string | null
          telefone?: string | null
        }
        Update: {
          acao?: string | null
          criado_em?: string
          detalhe?: string | null
          id?: string
          key_multa?: string | null
          multa_id?: string | null
          payload?: Json
          status?: string | null
          subscriber_id?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "frotas_multas_logs_multa_id_fkey"
            columns: ["multa_id"]
            isOneToOne: false
            referencedRelation: "frotas_multas"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_posicoes: {
        Row: {
          atualizado_em: string
          direcao: number | null
          endereco: string | null
          idgps: string | null
          ignicao: boolean | null
          latitude: number | null
          longitude: number | null
          motorista: string | null
          placa: string
          reportado_em: string | null
          sinal: string | null
          veiculo_id: string | null
          velocidade_kmh: number | null
        }
        Insert: {
          atualizado_em?: string
          direcao?: number | null
          endereco?: string | null
          idgps?: string | null
          ignicao?: boolean | null
          latitude?: number | null
          longitude?: number | null
          motorista?: string | null
          placa: string
          reportado_em?: string | null
          sinal?: string | null
          veiculo_id?: string | null
          velocidade_kmh?: number | null
        }
        Update: {
          atualizado_em?: string
          direcao?: number | null
          endereco?: string | null
          idgps?: string | null
          ignicao?: boolean | null
          latitude?: number | null
          longitude?: number | null
          motorista?: string | null
          placa?: string
          reportado_em?: string | null
          sinal?: string | null
          veiculo_id?: string | null
          velocidade_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "frotas_posicoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "frotas_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_posicoes_historico: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          motorista: string | null
          placa: string
          reportado_em: string | null
          veiculo_id: string | null
          velocidade_kmh: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          motorista?: string | null
          placa: string
          reportado_em?: string | null
          veiculo_id?: string | null
          velocidade_kmh?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          motorista?: string | null
          placa?: string
          reportado_em?: string | null
          veiculo_id?: string | null
          velocidade_kmh?: number | null
        }
        Relationships: []
      }
      frotas_print_ocr_execucoes: {
        Row: {
          arquivo_id: string | null
          arquivo_nome: string
          arquivo_url: string | null
          candidatos_ambiguos: Json
          criado_em: string
          criado_por: string | null
          data_notificacao: string | null
          id: number
          ids_arquivados: Json
          ids_correspondentes: Json
          motivo: string | null
          motorista_ocr: string | null
          placa_ocr: string | null
          processado_em: string | null
          registros_ocr: Json
          resposta_ocr: Json
          status: string
        }
        Insert: {
          arquivo_id?: string | null
          arquivo_nome: string
          arquivo_url?: string | null
          candidatos_ambiguos?: Json
          criado_em?: string
          criado_por?: string | null
          data_notificacao?: string | null
          id?: never
          ids_arquivados?: Json
          ids_correspondentes?: Json
          motivo?: string | null
          motorista_ocr?: string | null
          placa_ocr?: string | null
          processado_em?: string | null
          registros_ocr?: Json
          resposta_ocr?: Json
          status?: string
        }
        Update: {
          arquivo_id?: string | null
          arquivo_nome?: string
          arquivo_url?: string | null
          candidatos_ambiguos?: Json
          criado_em?: string
          criado_por?: string | null
          data_notificacao?: string | null
          id?: never
          ids_arquivados?: Json
          ids_correspondentes?: Json
          motivo?: string | null
          motorista_ocr?: string | null
          placa_ocr?: string | null
          processado_em?: string | null
          registros_ocr?: Json
          resposta_ocr?: Json
          status?: string
        }
        Relationships: []
      }
      frotas_rastreadores: {
        Row: {
          agendamentos_frustrados: number | null
          cidade: string | null
          cod_rastreio: string | null
          contato: string | null
          contrato: number | null
          contrato_assinado: boolean | null
          created_at: string
          data_envio: string | null
          data_instalacao: string | null
          estado: string | null
          id: string
          imei: string | null
          infleet: string | null
          local_instalacao: string | null
          nao_atendido: boolean
          observacoes: string | null
          placa: string
          previsao_chegada: string | null
          responsavel: string | null
          status: string
          termo_assinado: string | null
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          agendamentos_frustrados?: number | null
          cidade?: string | null
          cod_rastreio?: string | null
          contato?: string | null
          contrato?: number | null
          contrato_assinado?: boolean | null
          created_at?: string
          data_envio?: string | null
          data_instalacao?: string | null
          estado?: string | null
          id?: string
          imei?: string | null
          infleet?: string | null
          local_instalacao?: string | null
          nao_atendido?: boolean
          observacoes?: string | null
          placa: string
          previsao_chegada?: string | null
          responsavel?: string | null
          status?: string
          termo_assinado?: string | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          agendamentos_frustrados?: number | null
          cidade?: string | null
          cod_rastreio?: string | null
          contato?: string | null
          contrato?: number | null
          contrato_assinado?: boolean | null
          created_at?: string
          data_envio?: string | null
          data_instalacao?: string | null
          estado?: string | null
          id?: string
          imei?: string | null
          infleet?: string | null
          local_instalacao?: string | null
          nao_atendido?: boolean
          observacoes?: string | null
          placa?: string
          previsao_chegada?: string | null
          responsavel?: string | null
          status?: string
          termo_assinado?: string | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "frotas_rastreadores_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "frotas_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_rastreadores_manutencoes: {
        Row: {
          aberta_em: string
          aberta_por: string | null
          aberta_por_nome: string | null
          data_agendada: string | null
          disponibilidade_motorista: string | null
          encerrada_em: string | null
          encerrada_por_nome: string | null
          etapa: string
          hora_agendada: string | null
          id: string
          linha_tempo: Json
          local_agendado: string | null
          local_maps_url: string | null
          motivo: string | null
          motorista_contato: string | null
          motorista_nome: string | null
          placa: string
          resolucao: string | null
          situacao: string
          status_anterior: string | null
          status_manut: string
          tecnico_contato: string | null
          tecnico_nome: string | null
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          aberta_em?: string
          aberta_por?: string | null
          aberta_por_nome?: string | null
          data_agendada?: string | null
          disponibilidade_motorista?: string | null
          encerrada_em?: string | null
          encerrada_por_nome?: string | null
          etapa?: string
          hora_agendada?: string | null
          id?: string
          linha_tempo?: Json
          local_agendado?: string | null
          local_maps_url?: string | null
          motivo?: string | null
          motorista_contato?: string | null
          motorista_nome?: string | null
          placa: string
          resolucao?: string | null
          situacao?: string
          status_anterior?: string | null
          status_manut?: string
          tecnico_contato?: string | null
          tecnico_nome?: string | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          aberta_em?: string
          aberta_por?: string | null
          aberta_por_nome?: string | null
          data_agendada?: string | null
          disponibilidade_motorista?: string | null
          encerrada_em?: string | null
          encerrada_por_nome?: string | null
          etapa?: string
          hora_agendada?: string | null
          id?: string
          linha_tempo?: Json
          local_agendado?: string | null
          local_maps_url?: string | null
          motivo?: string | null
          motorista_contato?: string | null
          motorista_nome?: string | null
          placa?: string
          resolucao?: string | null
          situacao?: string
          status_anterior?: string | null
          status_manut?: string
          tecnico_contato?: string | null
          tecnico_nome?: string | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "frotas_rastreadores_manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "frotas_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_rastreadores_observacoes: {
        Row: {
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          data: string
          descricao: string
          id: string
          placa: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data?: string
          descricao: string
          id?: string
          placa: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data?: string
          descricao?: string
          id?: string
          placa?: string
        }
        Relationships: []
      }
      frotas_rastreadores_removidos: {
        Row: {
          created_at: string
          id: string
          motivo_remocao: string
          placa: string
          rastreador_id: string | null
          removido_em: string
          removido_por: string | null
          removido_por_nome: string | null
          snapshot: Json
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          motivo_remocao: string
          placa: string
          rastreador_id?: string | null
          removido_em?: string
          removido_por?: string | null
          removido_por_nome?: string | null
          snapshot?: Json
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          motivo_remocao?: string
          placa?: string
          rastreador_id?: string | null
          removido_em?: string
          removido_por?: string | null
          removido_por_nome?: string | null
          snapshot?: Json
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "frotas_rastreadores_removidos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "frotas_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_rotas: {
        Row: {
          created_at: string
          criado_por: string | null
          data: string
          duracao_estimada_min: number | null
          geometria: Json | null
          id: string
          km_total_estimado: number | null
          motorista: string | null
          origem_latitude: number | null
          origem_longitude: number | null
          placa: string
          publicado_em: string | null
          qtd_paradas: number
          status: string
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          data: string
          duracao_estimada_min?: number | null
          geometria?: Json | null
          id?: string
          km_total_estimado?: number | null
          motorista?: string | null
          origem_latitude?: number | null
          origem_longitude?: number | null
          placa: string
          publicado_em?: string | null
          qtd_paradas?: number
          status?: string
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          data?: string
          duracao_estimada_min?: number | null
          geometria?: Json | null
          id?: string
          km_total_estimado?: number | null
          motorista?: string | null
          origem_latitude?: number | null
          origem_longitude?: number | null
          placa?: string
          publicado_em?: string | null
          qtd_paradas?: number
          status?: string
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "frotas_rotas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "frotas_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_rotas_paradas: {
        Row: {
          colaborador_nome: string | null
          concluido_em: string | null
          created_at: string
          distancia_km_trecho: number | null
          duracao_min_trecho: number | null
          embarque_texto: string | null
          id: string
          latitude: number
          longitude: number
          ordem: number
          os_id: string | null
          ponto_nome: string | null
          rota_id: string
          status: string
          tipo: string
        }
        Insert: {
          colaborador_nome?: string | null
          concluido_em?: string | null
          created_at?: string
          distancia_km_trecho?: number | null
          duracao_min_trecho?: number | null
          embarque_texto?: string | null
          id?: string
          latitude: number
          longitude: number
          ordem: number
          os_id?: string | null
          ponto_nome?: string | null
          rota_id: string
          status?: string
          tipo?: string
        }
        Update: {
          colaborador_nome?: string | null
          concluido_em?: string | null
          created_at?: string
          distancia_km_trecho?: number | null
          duracao_min_trecho?: number | null
          embarque_texto?: string | null
          id?: string
          latitude?: number
          longitude?: number
          ordem?: number
          os_id?: string | null
          ponto_nome?: string | null
          rota_id?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "frotas_rotas_paradas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "operacional_os"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frotas_rotas_paradas_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "frotas_rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_sync_logs: {
        Row: {
          created_at: string
          id: string
          resumo: Json
          status: string
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          resumo?: Json
          status: string
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          resumo?: Json
          status?: string
          tipo?: string
        }
        Relationships: []
      }
      frotas_trocas_oleo: {
        Row: {
          anexo_url: string | null
          created_at: string
          criado_por: string | null
          custo: number | null
          data_execucao: string
          id: string
          km_execucao: number | null
          observacoes: string | null
          proxima_data: string | null
          proxima_km: number | null
          tipo_oleo: string | null
          updated_at: string
          veiculo_id: string
        }
        Insert: {
          anexo_url?: string | null
          created_at?: string
          criado_por?: string | null
          custo?: number | null
          data_execucao?: string
          id?: string
          km_execucao?: number | null
          observacoes?: string | null
          proxima_data?: string | null
          proxima_km?: number | null
          tipo_oleo?: string | null
          updated_at?: string
          veiculo_id: string
        }
        Update: {
          anexo_url?: string | null
          created_at?: string
          criado_por?: string | null
          custo?: number | null
          data_execucao?: string
          id?: string
          km_execucao?: number | null
          observacoes?: string | null
          proxima_data?: string | null
          proxima_km?: number | null
          tipo_oleo?: string | null
          updated_at?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "frotas_trocas_oleo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "frotas_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      frotas_veiculos: {
        Row: {
          ano: number | null
          ano_fabricacao: number | null
          ano_modelo: number | null
          apolice_seguro: string | null
          arquivo_nome: string | null
          bfleet_ano: string | null
          bfleet_ativo_nome: string | null
          bfleet_condutor: string | null
          bfleet_condutor_atualizado_em: string | null
          bfleet_condutor_erro: string | null
          bfleet_condutor_id: string | null
          bfleet_condutor_status: string | null
          bfleet_confirmado: boolean | null
          bfleet_device_id: string | null
          bfleet_divergencia: boolean | null
          bfleet_gatewayip: string | null
          bfleet_grupo: string | null
          bfleet_id: string | null
          bfleet_idgps: string | null
          bfleet_marca: string | null
          bfleet_mensagem: string | null
          bfleet_modelo: string | null
          bfleet_nome: string | null
          bfleet_odometro: string | null
          bfleet_patente: string | null
          bfleet_placa: string | null
          bfleet_rastreador: boolean | null
          bfleet_raw: Json | null
          bfleet_status: string | null
          bfleet_sync_at: string | null
          bfleet_ultima_sincronizacao_em: string | null
          bfleet_ultima_sync_em: string | null
          bfleet_vehicle_id: string | null
          chassi: string | null
          cnpj: string | null
          combustivel: string | null
          condutor_divergente: boolean | null
          condutor_patrimonio: string | null
          coordenacao: string | null
          cor: string | null
          created_at: string
          detran_confirmado: boolean
          detran_mensagem: string | null
          detran_raw: Json
          detran_status: string
          detran_token_key: string | null
          detran_ultima_consulta_em: string | null
          dia_vencimento: number | null
          empresa: string | null
          especie: string | null
          grm_cadastro_em: string | null
          grm_cadastro_mensagem: string | null
          grm_cadastro_status: string | null
          grm_cadastro_tentativas: number
          grm_cadastro_travado_em: string | null
          grm_patrimonio_numero: string | null
          grm_veh_code: number | null
          hodometro: number | null
          id: string
          import_hash: string | null
          marca: string | null
          marca_modelo: string | null
          modelo: string | null
          motorista_atual: string | null
          multas_mensagem: string | null
          multas_status: string | null
          multas_ultima_consulta_em: string | null
          municipio_uf: string | null
          nome: string | null
          observacoes: string | null
          origem: string | null
          origem_importacao: string
          patrimonio_codigo: string | null
          patrimonio_coordenacao: string | null
          patrimonio_data_upload: string | null
          patrimonio_dias_sem_leitura: number | null
          patrimonio_funcionario: string | null
          patrimonio_identificacao: string | null
          patrimonio_importacao_id: string | null
          patrimonio_supervisao: string | null
          patrimonio_sync_em: string | null
          patrimonio_ultima_leitura: string | null
          placa: string
          placa_normalizada: string | null
          possui_rastreador: boolean | null
          rastreador_bfleet: boolean | null
          rastreador_origem: string | null
          raw: Json
          renavam: string | null
          rs_km: number | null
          seguro_vencimento: string | null
          situacao_detran: string | null
          situacao_veiculo: string | null
          status: string
          supervisao: string | null
          tipo: string | null
          tipo_veiculo: string | null
          updated_at: string
          valor_km: number | null
          valor_mensal: number | null
        }
        Insert: {
          ano?: number | null
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          apolice_seguro?: string | null
          arquivo_nome?: string | null
          bfleet_ano?: string | null
          bfleet_ativo_nome?: string | null
          bfleet_condutor?: string | null
          bfleet_condutor_atualizado_em?: string | null
          bfleet_condutor_erro?: string | null
          bfleet_condutor_id?: string | null
          bfleet_condutor_status?: string | null
          bfleet_confirmado?: boolean | null
          bfleet_device_id?: string | null
          bfleet_divergencia?: boolean | null
          bfleet_gatewayip?: string | null
          bfleet_grupo?: string | null
          bfleet_id?: string | null
          bfleet_idgps?: string | null
          bfleet_marca?: string | null
          bfleet_mensagem?: string | null
          bfleet_modelo?: string | null
          bfleet_nome?: string | null
          bfleet_odometro?: string | null
          bfleet_patente?: string | null
          bfleet_placa?: string | null
          bfleet_rastreador?: boolean | null
          bfleet_raw?: Json | null
          bfleet_status?: string | null
          bfleet_sync_at?: string | null
          bfleet_ultima_sincronizacao_em?: string | null
          bfleet_ultima_sync_em?: string | null
          bfleet_vehicle_id?: string | null
          chassi?: string | null
          cnpj?: string | null
          combustivel?: string | null
          condutor_divergente?: boolean | null
          condutor_patrimonio?: string | null
          coordenacao?: string | null
          cor?: string | null
          created_at?: string
          detran_confirmado?: boolean
          detran_mensagem?: string | null
          detran_raw?: Json
          detran_status?: string
          detran_token_key?: string | null
          detran_ultima_consulta_em?: string | null
          dia_vencimento?: number | null
          empresa?: string | null
          especie?: string | null
          grm_cadastro_em?: string | null
          grm_cadastro_mensagem?: string | null
          grm_cadastro_status?: string | null
          grm_cadastro_tentativas?: number
          grm_cadastro_travado_em?: string | null
          grm_patrimonio_numero?: string | null
          grm_veh_code?: number | null
          hodometro?: number | null
          id?: string
          import_hash?: string | null
          marca?: string | null
          marca_modelo?: string | null
          modelo?: string | null
          motorista_atual?: string | null
          multas_mensagem?: string | null
          multas_status?: string | null
          multas_ultima_consulta_em?: string | null
          municipio_uf?: string | null
          nome?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_importacao?: string
          patrimonio_codigo?: string | null
          patrimonio_coordenacao?: string | null
          patrimonio_data_upload?: string | null
          patrimonio_dias_sem_leitura?: number | null
          patrimonio_funcionario?: string | null
          patrimonio_identificacao?: string | null
          patrimonio_importacao_id?: string | null
          patrimonio_supervisao?: string | null
          patrimonio_sync_em?: string | null
          patrimonio_ultima_leitura?: string | null
          placa: string
          placa_normalizada?: string | null
          possui_rastreador?: boolean | null
          rastreador_bfleet?: boolean | null
          rastreador_origem?: string | null
          raw?: Json
          renavam?: string | null
          rs_km?: number | null
          seguro_vencimento?: string | null
          situacao_detran?: string | null
          situacao_veiculo?: string | null
          status?: string
          supervisao?: string | null
          tipo?: string | null
          tipo_veiculo?: string | null
          updated_at?: string
          valor_km?: number | null
          valor_mensal?: number | null
        }
        Update: {
          ano?: number | null
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          apolice_seguro?: string | null
          arquivo_nome?: string | null
          bfleet_ano?: string | null
          bfleet_ativo_nome?: string | null
          bfleet_condutor?: string | null
          bfleet_condutor_atualizado_em?: string | null
          bfleet_condutor_erro?: string | null
          bfleet_condutor_id?: string | null
          bfleet_condutor_status?: string | null
          bfleet_confirmado?: boolean | null
          bfleet_device_id?: string | null
          bfleet_divergencia?: boolean | null
          bfleet_gatewayip?: string | null
          bfleet_grupo?: string | null
          bfleet_id?: string | null
          bfleet_idgps?: string | null
          bfleet_marca?: string | null
          bfleet_mensagem?: string | null
          bfleet_modelo?: string | null
          bfleet_nome?: string | null
          bfleet_odometro?: string | null
          bfleet_patente?: string | null
          bfleet_placa?: string | null
          bfleet_rastreador?: boolean | null
          bfleet_raw?: Json | null
          bfleet_status?: string | null
          bfleet_sync_at?: string | null
          bfleet_ultima_sincronizacao_em?: string | null
          bfleet_ultima_sync_em?: string | null
          bfleet_vehicle_id?: string | null
          chassi?: string | null
          cnpj?: string | null
          combustivel?: string | null
          condutor_divergente?: boolean | null
          condutor_patrimonio?: string | null
          coordenacao?: string | null
          cor?: string | null
          created_at?: string
          detran_confirmado?: boolean
          detran_mensagem?: string | null
          detran_raw?: Json
          detran_status?: string
          detran_token_key?: string | null
          detran_ultima_consulta_em?: string | null
          dia_vencimento?: number | null
          empresa?: string | null
          especie?: string | null
          grm_cadastro_em?: string | null
          grm_cadastro_mensagem?: string | null
          grm_cadastro_status?: string | null
          grm_cadastro_tentativas?: number
          grm_cadastro_travado_em?: string | null
          grm_patrimonio_numero?: string | null
          grm_veh_code?: number | null
          hodometro?: number | null
          id?: string
          import_hash?: string | null
          marca?: string | null
          marca_modelo?: string | null
          modelo?: string | null
          motorista_atual?: string | null
          multas_mensagem?: string | null
          multas_status?: string | null
          multas_ultima_consulta_em?: string | null
          municipio_uf?: string | null
          nome?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_importacao?: string
          patrimonio_codigo?: string | null
          patrimonio_coordenacao?: string | null
          patrimonio_data_upload?: string | null
          patrimonio_dias_sem_leitura?: number | null
          patrimonio_funcionario?: string | null
          patrimonio_identificacao?: string | null
          patrimonio_importacao_id?: string | null
          patrimonio_supervisao?: string | null
          patrimonio_sync_em?: string | null
          patrimonio_ultima_leitura?: string | null
          placa?: string
          placa_normalizada?: string | null
          possui_rastreador?: boolean | null
          rastreador_bfleet?: boolean | null
          rastreador_origem?: string | null
          raw?: Json
          renavam?: string | null
          rs_km?: number | null
          seguro_vencimento?: string | null
          situacao_detran?: string | null
          situacao_veiculo?: string | null
          status?: string
          supervisao?: string | null
          tipo?: string | null
          tipo_veiculo?: string | null
          updated_at?: string
          valor_km?: number | null
          valor_mensal?: number | null
        }
        Relationships: []
      }
      frotas_veiculos_historico: {
        Row: {
          criado_em: string
          data_fim: string | null
          data_inicio: string
          id: string
          motorista: string | null
          veiculo_id: string
        }
        Insert: {
          criado_em?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          motorista?: string | null
          veiculo_id: string
        }
        Update: {
          criado_em?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          motorista?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "frotas_veiculos_historico_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "frotas_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      geocode_cache: {
        Row: {
          atualizado_em: string
          chave: string
          criado_em: string
          endereco_resolvido: string | null
          latitude: number | null
          longitude: number | null
          status: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          criado_em?: string
          endereco_resolvido?: string | null
          latitude?: number | null
          longitude?: number | null
          status?: string
          tipo: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          criado_em?: string
          endereco_resolvido?: string | null
          latitude?: number | null
          longitude?: number | null
          status?: string
          tipo?: string
        }
        Relationships: []
      }
      google_contacts_connections: {
        Row: {
          access_token_enc: string | null
          active: boolean
          contact_group_etag: string | null
          contact_group_resource_name: string | null
          created_at: string
          expires_at: string | null
          google_email: string | null
          google_sub: string | null
          id: string
          last_sync_at: string | null
          refresh_token_enc: string | null
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          active?: boolean
          contact_group_etag?: string | null
          contact_group_resource_name?: string | null
          created_at?: string
          expires_at?: string | null
          google_email?: string | null
          google_sub?: string | null
          id?: string
          last_sync_at?: string | null
          refresh_token_enc?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          active?: boolean
          contact_group_etag?: string | null
          contact_group_resource_name?: string | null
          created_at?: string
          expires_at?: string | null
          google_email?: string | null
          google_sub?: string | null
          id?: string
          last_sync_at?: string | null
          refresh_token_enc?: string | null
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_contacts_jobs: {
        Row: {
          atualizados: number
          batch_size: number
          cleanup_old: boolean
          created_at: string
          criados: number
          cursor: number
          erro: string | null
          erros: number
          finished_at: string | null
          id: string
          ignorados: number
          progresso: number
          recriados: number
          removidos: number
          started_at: string | null
          status: string
          tipo: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          atualizados?: number
          batch_size?: number
          cleanup_old?: boolean
          created_at?: string
          criados?: number
          cursor?: number
          erro?: string | null
          erros?: number
          finished_at?: string | null
          id?: string
          ignorados?: number
          progresso?: number
          recriados?: number
          removidos?: number
          started_at?: string | null
          status?: string
          tipo?: string
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          atualizados?: number
          batch_size?: number
          cleanup_old?: boolean
          created_at?: string
          criados?: number
          cursor?: number
          erro?: string | null
          erros?: number
          finished_at?: string | null
          id?: string
          ignorados?: number
          progresso?: number
          recriados?: number
          removidos?: number
          started_at?: string | null
          status?: string
          tipo?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_contacts_logs: {
        Row: {
          created_at: string
          detalhes: Json
          id: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detalhes?: Json
          id?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detalhes?: Json
          id?: number
          user_id?: string | null
        }
        Relationships: []
      }
      google_contacts_map: {
        Row: {
          colaborador_key: string
          cpf: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          etag: string | null
          id: string
          last_payload_hash: string | null
          last_sync_at: string | null
          nome: string | null
          resource_name: string | null
          status: string
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          colaborador_key: string
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          etag?: string | null
          id?: string
          last_payload_hash?: string | null
          last_sync_at?: string | null
          nome?: string | null
          resource_name?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          colaborador_key?: string
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          etag?: string | null
          id?: string
          last_payload_hash?: string | null
          last_sync_at?: string | null
          nome?: string | null
          resource_name?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_contacts_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          redirect_to: string | null
          state: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          redirect_to?: string | null
          state: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      google_contacts_sync_jobs: {
        Row: {
          batch_size: number
          cleanup_old: boolean
          created_at: string
          cursor: number
          error: string | null
          finished_at: string | null
          id: string
          resumo: Json
          started_at: string | null
          status: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_size?: number
          cleanup_old?: boolean
          created_at?: string
          cursor?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          resumo?: Json
          started_at?: string | null
          status?: string
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_size?: number
          cleanup_old?: boolean
          created_at?: string
          cursor?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          resumo?: Json
          started_at?: string | null
          status?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      grm_abertura_os_execucoes: {
        Row: {
          abertura_os_id: string
          created_at: string
          detalhes: Json
          dry_run: boolean
          finalizado_em: string | null
          id: string
          iniciado_em: string
          mensagem: string | null
          numero_os: string | null
          status: string
        }
        Insert: {
          abertura_os_id: string
          created_at?: string
          detalhes?: Json
          dry_run?: boolean
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          mensagem?: string | null
          numero_os?: string | null
          status?: string
        }
        Update: {
          abertura_os_id?: string
          created_at?: string
          detalhes?: Json
          dry_run?: boolean
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          mensagem?: string | null
          numero_os?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "grm_abertura_os_execucoes_abertura_os_id_fkey"
            columns: ["abertura_os_id"]
            isOneToOne: false
            referencedRelation: "logistica_abertura_os"
            referencedColumns: ["id"]
          },
        ]
      }
      grm_adiantamentos_importacoes: {
        Row: {
          colaborador: string | null
          conta: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string | null
          dados_json: Json | null
          data_registro: string | null
          data_sincronizacao: string | null
          data_solicitacao: string | null
          descricao: string | null
          embarque: string | null
          id: string
          leitura_mais_antiga: string | null
          ofr_code: number
          ofr_status: string | null
          pendente_no_grm: boolean
          saiu_pendente_em: string | null
          saldo: number | null
          supervisao: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          colaborador?: string | null
          conta?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_registro?: string | null
          data_sincronizacao?: string | null
          data_solicitacao?: string | null
          descricao?: string | null
          embarque?: string | null
          id?: string
          leitura_mais_antiga?: string | null
          ofr_code: number
          ofr_status?: string | null
          pendente_no_grm?: boolean
          saiu_pendente_em?: string | null
          saldo?: number | null
          supervisao?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          colaborador?: string | null
          conta?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_registro?: string | null
          data_sincronizacao?: string | null
          data_solicitacao?: string | null
          descricao?: string | null
          embarque?: string | null
          id?: string
          leitura_mais_antiga?: string | null
          ofr_code?: number
          ofr_status?: string | null
          pendente_no_grm?: boolean
          saiu_pendente_em?: string | null
          saldo?: number | null
          supervisao?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      grm_alertas_destinos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          telefone: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          telefone: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          telefone?: string
        }
        Relationships: []
      }
      grm_alertas_enviados: {
        Row: {
          chave: string
          destinos: number
          enviado_em: string
          mensagem: string | null
        }
        Insert: {
          chave: string
          destinos?: number
          enviado_em?: string
          mensagem?: string | null
        }
        Update: {
          chave?: string
          destinos?: number
          enviado_em?: string
          mensagem?: string | null
        }
        Relationships: []
      }
      grm_auditorias_importacoes: {
        Row: {
          created_at: string | null
          dados_json: Json | null
          data_sincronizacao: string | null
          id: string
          sincronizado_em: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grm_cargas_importacoes: {
        Row: {
          chave_unica: string
          cliente: string | null
          colaborador: string | null
          coordenacao: string | null
          created_at: string
          dados_json: Json
          data_classificacao: string | null
          id: string
          lat_lancamento: number | null
          laudo: string | null
          lng_lancamento: number | null
          nota_fiscal: string | null
          os: string | null
          placa: string | null
          sincronizado_em: string
          supervisao: string | null
          updated_at: string
        }
        Insert: {
          chave_unica: string
          cliente?: string | null
          colaborador?: string | null
          coordenacao?: string | null
          created_at?: string
          dados_json?: Json
          data_classificacao?: string | null
          id?: string
          lat_lancamento?: number | null
          laudo?: string | null
          lng_lancamento?: number | null
          nota_fiscal?: string | null
          os?: string | null
          placa?: string | null
          sincronizado_em?: string
          supervisao?: string | null
          updated_at?: string
        }
        Update: {
          chave_unica?: string
          cliente?: string | null
          colaborador?: string | null
          coordenacao?: string | null
          created_at?: string
          dados_json?: Json
          data_classificacao?: string | null
          id?: string
          lat_lancamento?: number | null
          laudo?: string | null
          lng_lancamento?: number | null
          nota_fiscal?: string | null
          os?: string | null
          placa?: string | null
          sincronizado_em?: string
          supervisao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      grm_contas_pagar_importacoes: {
        Row: {
          created_at: string | null
          dados_json: Json | null
          data_sincronizacao: string | null
          id: string
          sincronizado_em: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grm_contas_receber_importacoes: {
        Row: {
          created_at: string | null
          dados_json: Json | null
          data_sincronizacao: string | null
          id: string
          sincronizado_em: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grm_despesas_estado_colaborador: {
        Row: {
          aplicado_em: string | null
          colaborador_id: string | null
          cpf: string
          created_at: string
          data_referencia: string
          deve_liberar: boolean
          hash_aplicado: string | null
          hash_desejado: string | null
          nome: string
          regional_origem: string | null
          regras_desejadas: Json
          status_aplicacao: string
          updated_at: string
          versao_desejada_id: string | null
        }
        Insert: {
          aplicado_em?: string | null
          colaborador_id?: string | null
          cpf: string
          created_at?: string
          data_referencia: string
          deve_liberar?: boolean
          hash_aplicado?: string | null
          hash_desejado?: string | null
          nome: string
          regional_origem?: string | null
          regras_desejadas?: Json
          status_aplicacao?: string
          updated_at?: string
          versao_desejada_id?: string | null
        }
        Update: {
          aplicado_em?: string | null
          colaborador_id?: string | null
          cpf?: string
          created_at?: string
          data_referencia?: string
          deve_liberar?: boolean
          hash_aplicado?: string | null
          hash_desejado?: string | null
          nome?: string
          regional_origem?: string | null
          regras_desejadas?: Json
          status_aplicacao?: string
          updated_at?: string
          versao_desejada_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grm_despesas_estado_colaborador_versao_desejada_id_fkey"
            columns: ["versao_desejada_id"]
            isOneToOne: false
            referencedRelation: "grm_despesas_versoes"
            referencedColumns: ["id"]
          },
        ]
      }
      grm_despesas_fila: {
        Row: {
          acao: string
          colaborador_id: string | null
          cpf: string
          created_at: string
          data_referencia: string
          diagnostico: Json
          finalizado_em: string | null
          hash_desejado: string
          id: string
          locked_at: string | null
          max_tentativas: number
          nome: string
          programacao_id: string | null
          regional: string
          regras: Json
          screenshot_path: string | null
          status: string
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
          versao_id: string
        }
        Insert: {
          acao: string
          colaborador_id?: string | null
          cpf: string
          created_at?: string
          data_referencia: string
          diagnostico?: Json
          finalizado_em?: string | null
          hash_desejado: string
          id?: string
          locked_at?: string | null
          max_tentativas?: number
          nome: string
          programacao_id?: string | null
          regional: string
          regras?: Json
          screenshot_path?: string | null
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
          versao_id: string
        }
        Update: {
          acao?: string
          colaborador_id?: string | null
          cpf?: string
          created_at?: string
          data_referencia?: string
          diagnostico?: Json
          finalizado_em?: string | null
          hash_desejado?: string
          id?: string
          locked_at?: string | null
          max_tentativas?: number
          nome?: string
          programacao_id?: string | null
          regional?: string
          regras?: Json
          screenshot_path?: string | null
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
          versao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grm_despesas_fila_versao_id_fkey"
            columns: ["versao_id"]
            isOneToOne: false
            referencedRelation: "grm_despesas_versoes"
            referencedColumns: ["id"]
          },
        ]
      }
      grm_despesas_importacoes: {
        Row: {
          categoria: string | null
          coordenacao: string | null
          created_at: string | null
          dados_json: Json | null
          data_conta_ate: string | null
          data_conta_de: string | null
          data_sincronizacao: string | null
          fornecedor: string | null
          funcionario: string | null
          grupo_categoria: string | null
          id: string
          sincronizado_em: string | null
          supervisao: string | null
          updated_at: string | null
          valor: number | null
          vincular_caixa_operacional: string | null
        }
        Insert: {
          categoria?: string | null
          coordenacao?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_conta_ate?: string | null
          data_conta_de?: string | null
          data_sincronizacao?: string | null
          fornecedor?: string | null
          funcionario?: string | null
          grupo_categoria?: string | null
          id?: string
          sincronizado_em?: string | null
          supervisao?: string | null
          updated_at?: string | null
          valor?: number | null
          vincular_caixa_operacional?: string | null
        }
        Update: {
          categoria?: string | null
          coordenacao?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_conta_ate?: string | null
          data_conta_de?: string | null
          data_sincronizacao?: string | null
          fornecedor?: string | null
          funcionario?: string | null
          grupo_categoria?: string | null
          id?: string
          sincronizado_em?: string | null
          supervisao?: string | null
          updated_at?: string | null
          valor?: number | null
          vincular_caixa_operacional?: string | null
        }
        Relationships: []
      }
      grm_despesas_importacoes_backup_20260624: {
        Row: {
          categoria: string | null
          coordenacao: string | null
          created_at: string | null
          dados_json: Json | null
          data_conta_ate: string | null
          data_conta_de: string | null
          data_sincronizacao: string | null
          fornecedor: string | null
          funcionario: string | null
          grupo_categoria: string | null
          id: string | null
          sincronizado_em: string | null
          supervisao: string | null
          updated_at: string | null
          valor: number | null
          vincular_caixa_operacional: string | null
        }
        Insert: {
          categoria?: string | null
          coordenacao?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_conta_ate?: string | null
          data_conta_de?: string | null
          data_sincronizacao?: string | null
          fornecedor?: string | null
          funcionario?: string | null
          grupo_categoria?: string | null
          id?: string | null
          sincronizado_em?: string | null
          supervisao?: string | null
          updated_at?: string | null
          valor?: number | null
          vincular_caixa_operacional?: string | null
        }
        Update: {
          categoria?: string | null
          coordenacao?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_conta_ate?: string | null
          data_conta_de?: string | null
          data_sincronizacao?: string | null
          fornecedor?: string | null
          funcionario?: string | null
          grupo_categoria?: string | null
          id?: string | null
          sincronizado_em?: string | null
          supervisao?: string | null
          updated_at?: string | null
          valor?: number | null
          vincular_caixa_operacional?: string | null
        }
        Relationships: []
      }
      grm_despesas_retroativas_auditoria: {
        Row: {
          acao: string
          colaborador: string
          cpf: string
          created_at: string
          data_referencia: string
          diagnostico: Json
          dry_run: boolean
          erro: string | null
          id: string
          oex_code: number
          ofm_code: number | null
          sta_code: number
          sucesso: boolean
          tipo_contrato: string
          tipo_despesa: string
          valor: number
        }
        Insert: {
          acao: string
          colaborador: string
          cpf: string
          created_at?: string
          data_referencia: string
          diagnostico?: Json
          dry_run?: boolean
          erro?: string | null
          id?: string
          oex_code: number
          ofm_code?: number | null
          sta_code: number
          sucesso?: boolean
          tipo_contrato: string
          tipo_despesa: string
          valor: number
        }
        Update: {
          acao?: string
          colaborador?: string
          cpf?: string
          created_at?: string
          data_referencia?: string
          diagnostico?: Json
          dry_run?: boolean
          erro?: string | null
          id?: string
          oex_code?: number
          ofm_code?: number | null
          sta_code?: number
          sucesso?: boolean
          tipo_contrato?: string
          tipo_despesa?: string
          valor?: number
        }
        Relationships: []
      }
      grm_despesas_tipos_config: {
        Row: {
          ativo: boolean
          auto: boolean
          carga_nhe: boolean
          chave: string
          created_at: string
          exibir: boolean
          max_mov_dia: number
          observacao: string | null
          origem: string
          tipo_grm: string
          updated_at: string
          valor_padrao: number | null
        }
        Insert: {
          ativo?: boolean
          auto?: boolean
          carga_nhe?: boolean
          chave: string
          created_at?: string
          exibir?: boolean
          max_mov_dia?: number
          observacao?: string | null
          origem: string
          tipo_grm: string
          updated_at?: string
          valor_padrao?: number | null
        }
        Update: {
          ativo?: boolean
          auto?: boolean
          carga_nhe?: boolean
          chave?: string
          created_at?: string
          exibir?: boolean
          max_mov_dia?: number
          observacao?: string | null
          origem?: string
          tipo_grm?: string
          updated_at?: string
          valor_padrao?: number | null
        }
        Relationships: []
      }
      grm_despesas_versoes: {
        Row: {
          created_at: string
          data_referencia: string
          gestor_id: string | null
          id: string
          motivo: string
          programacao_ids: Json
          regional: string
          resumo: Json
          sequencia: number
        }
        Insert: {
          created_at?: string
          data_referencia: string
          gestor_id?: string | null
          id?: string
          motivo: string
          programacao_ids?: Json
          regional: string
          resumo?: Json
          sequencia?: number
        }
        Update: {
          created_at?: string
          data_referencia?: string
          gestor_id?: string | null
          id?: string
          motivo?: string
          programacao_ids?: Json
          regional?: string
          resumo?: Json
          sequencia?: number
        }
        Relationships: []
      }
      grm_distribuicao_os_importacoes: {
        Row: {
          created_at: string | null
          dados_json: Json | null
          data_sincronizacao: string | null
          id: string
          sincronizado_em: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grm_finalizacao_os_execucoes: {
        Row: {
          detalhes: Json | null
          dry_run: boolean
          erro: string | null
          finalizado_em: string | null
          id: number
          iniciado_em: string
          limite_execucao: number | null
          remanescente_max: number
          remanescente_min: number
          status: string
          total_candidatas: number
          total_dry_run: number
          total_erros: number
          total_exportadas: number
          total_ignoradas: number
          total_processadas: number
          total_sucesso: number
        }
        Insert: {
          detalhes?: Json | null
          dry_run?: boolean
          erro?: string | null
          finalizado_em?: string | null
          id?: number
          iniciado_em?: string
          limite_execucao?: number | null
          remanescente_max?: number
          remanescente_min?: number
          status?: string
          total_candidatas?: number
          total_dry_run?: number
          total_erros?: number
          total_exportadas?: number
          total_ignoradas?: number
          total_processadas?: number
          total_sucesso?: number
        }
        Update: {
          detalhes?: Json | null
          dry_run?: boolean
          erro?: string | null
          finalizado_em?: string | null
          id?: number
          iniciado_em?: string
          limite_execucao?: number | null
          remanescente_max?: number
          remanescente_min?: number
          status?: string
          total_candidatas?: number
          total_dry_run?: number
          total_erros?: number
          total_exportadas?: number
          total_ignoradas?: number
          total_processadas?: number
          total_sucesso?: number
        }
        Relationships: []
      }
      grm_finalizacao_os_resultados: {
        Row: {
          criado_em: string
          detalhes: Json | null
          erro: string | null
          execucao_id: number
          id: number
          os: string
          remanescente_exportado: number | null
          remanescente_tela: number | null
          status: string
        }
        Insert: {
          criado_em?: string
          detalhes?: Json | null
          erro?: string | null
          execucao_id: number
          id?: number
          os: string
          remanescente_exportado?: number | null
          remanescente_tela?: number | null
          status: string
        }
        Update: {
          criado_em?: string
          detalhes?: Json | null
          erro?: string | null
          execucao_id?: number
          id?: number
          os?: string
          remanescente_exportado?: number | null
          remanescente_tela?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "grm_finalizacao_os_resultados_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "grm_finalizacao_os_execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      grm_holerite_lancamentos: {
        Row: {
          arquivo_origem: string | null
          atualizado_em: string
          categoria: string
          chave_idempotencia: string
          criado_em: string
          data_conta: string
          data_vencimento: string
          empresa: string
          erro: string | null
          funcionario: string
          grm_url: string | null
          grupo_categoria: string
          id: string
          job_id: string | null
          numero_documento: string
          pagina_origem: number | null
          payload: Json
          processado_em: string | null
          referencia: string
          registro_funcionario: string
          status: string
          tentativas: number
          tipo_vinculo: string
          valor_liquido: number
        }
        Insert: {
          arquivo_origem?: string | null
          atualizado_em?: string
          categoria: string
          chave_idempotencia: string
          criado_em?: string
          data_conta: string
          data_vencimento: string
          empresa: string
          erro?: string | null
          funcionario: string
          grm_url?: string | null
          grupo_categoria?: string
          id?: string
          job_id?: string | null
          numero_documento: string
          pagina_origem?: number | null
          payload?: Json
          processado_em?: string | null
          referencia: string
          registro_funcionario: string
          status?: string
          tentativas?: number
          tipo_vinculo: string
          valor_liquido: number
        }
        Update: {
          arquivo_origem?: string | null
          atualizado_em?: string
          categoria?: string
          chave_idempotencia?: string
          criado_em?: string
          data_conta?: string
          data_vencimento?: string
          empresa?: string
          erro?: string | null
          funcionario?: string
          grm_url?: string | null
          grupo_categoria?: string
          id?: string
          job_id?: string | null
          numero_documento?: string
          pagina_origem?: number | null
          payload?: Json
          processado_em?: string | null
          referencia?: string
          registro_funcionario?: string
          status?: string
          tentativas?: number
          tipo_vinculo?: string
          valor_liquido?: number
        }
        Relationships: []
      }
      grm_lista_os_importacoes: {
        Row: {
          created_at: string | null
          dados_json: Json | null
          data_sincronizacao: string | null
          id: string
          sincronizado_em: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grm_locais_embarque_importacoes: {
        Row: {
          cliente_nacional: string | null
          coordenacao: string | null
          created_at: string | null
          dados_json: Json | null
          data_sincronizacao: string | null
          data_solicitacao_ate: string | null
          data_solicitacao_de: string | null
          id: string
          local_tipo_servico: string | null
          produto: string | null
          servico: string | null
          sincronizado_em: string | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          cliente_nacional?: string | null
          coordenacao?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          data_solicitacao_ate?: string | null
          data_solicitacao_de?: string | null
          id?: string
          local_tipo_servico?: string | null
          produto?: string | null
          servico?: string | null
          sincronizado_em?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          cliente_nacional?: string | null
          coordenacao?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          data_solicitacao_ate?: string | null
          data_solicitacao_de?: string | null
          id?: string
          local_tipo_servico?: string | null
          produto?: string | null
          servico?: string | null
          sincronizado_em?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grm_locais_servico: {
        Row: {
          ativo: boolean
          cidade: string
          cidade_norm: string
          latitude: number | null
          longitude: number | null
          nome_local: string
          nome_norm: string
          spl_code: number
          tipo_local: string | null
          uf: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade: string
          cidade_norm: string
          latitude?: number | null
          longitude?: number | null
          nome_local: string
          nome_norm: string
          spl_code: number
          tipo_local?: string | null
          uf: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string
          cidade_norm?: string
          latitude?: number | null
          longitude?: number | null
          nome_local?: string
          nome_norm?: string
          spl_code?: number
          tipo_local?: string | null
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      grm_login_alimentacao_execucoes: {
        Row: {
          created_at: string
          data_ate: string
          data_de: string
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          raw: Json
          status: string
          total_elegiveis: number | null
          total_locais: number | null
          total_movimentos: number | null
          total_relatorio: number | null
        }
        Insert: {
          created_at?: string
          data_ate: string
          data_de: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          raw?: Json
          status?: string
          total_elegiveis?: number | null
          total_locais?: number | null
          total_movimentos?: number | null
          total_relatorio?: number | null
        }
        Update: {
          created_at?: string
          data_ate?: string
          data_de?: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          raw?: Json
          status?: string
          total_elegiveis?: number | null
          total_locais?: number | null
          total_movimentos?: number | null
          total_relatorio?: number | null
        }
        Relationships: []
      }
      grm_login_movimentos_importacoes: {
        Row: {
          chave_unica: string
          cidade_embarque: string | null
          codigo_colaborador: string | null
          colaborador: string | null
          colaborador_chave: string
          coordenacao: string | null
          cpf: string | null
          created_at: string
          dados_json: Json
          data_movimento: string
          dispositivo: string | null
          hora_movimento: string | null
          id: string
          latitude: number | null
          local_servico: string | null
          longitude: number | null
          possui_movimento: boolean
          precisao_m: number | null
          sincronizado_em: string
          supervisao: string | null
          tipo_movimento: string | null
          uf_embarque: string | null
          updated_at: string
        }
        Insert: {
          chave_unica: string
          cidade_embarque?: string | null
          codigo_colaborador?: string | null
          colaborador?: string | null
          colaborador_chave: string
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          dados_json?: Json
          data_movimento: string
          dispositivo?: string | null
          hora_movimento?: string | null
          id?: string
          latitude?: number | null
          local_servico?: string | null
          longitude?: number | null
          possui_movimento?: boolean
          precisao_m?: number | null
          sincronizado_em?: string
          supervisao?: string | null
          tipo_movimento?: string | null
          uf_embarque?: string | null
          updated_at?: string
        }
        Update: {
          chave_unica?: string
          cidade_embarque?: string | null
          codigo_colaborador?: string | null
          colaborador?: string | null
          colaborador_chave?: string
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          dados_json?: Json
          data_movimento?: string
          dispositivo?: string | null
          hora_movimento?: string | null
          id?: string
          latitude?: number | null
          local_servico?: string | null
          longitude?: number | null
          possui_movimento?: boolean
          precisao_m?: number | null
          sincronizado_em?: string
          supervisao?: string | null
          tipo_movimento?: string | null
          uf_embarque?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      grm_mapa_embarque_importacoes: {
        Row: {
          created_at: string | null
          dados_json: Json | null
          data_sincronizacao: string | null
          id: string
          sincronizado_em: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grm_nf_baixa_execucoes: {
        Row: {
          created_at: string
          dry_run: boolean
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          resumo: Json
          status: string
        }
        Insert: {
          created_at?: string
          dry_run?: boolean
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          resumo?: Json
          status?: string
        }
        Update: {
          created_at?: string
          dry_run?: boolean
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          resumo?: Json
          status?: string
        }
        Relationships: []
      }
      grm_nf_baixas: {
        Row: {
          agencia_conta_pagador: string | null
          arquivo_mime_type: string | null
          arquivo_nome: string
          bacc_code: number | null
          baixado_em: string | null
          banco_pagador: string | null
          candidatos_json: Json
          created_at: string
          data_pagamento: string | null
          empresa_detectada: string | null
          enviado_por: string | null
          erro: string | null
          execucao_id: string | null
          extraido_json: Json
          favorecido_documento: string | null
          favorecido_nome: string | null
          fingerprint: string | null
          grm_nf_lancamento_id: string | null
          grm_resposta: Json | null
          id: string
          parcela_valor_total: number | null
          pat_code: number | null
          pin_code: string | null
          pin_codes_json: Json
          processado_em: string | null
          saldo_pendente: number
          status: string
          storage_bucket: string
          storage_path: string
          tentativas: number
          updated_at: string
          validacao_erros: Json
          valor: number | null
        }
        Insert: {
          agencia_conta_pagador?: string | null
          arquivo_mime_type?: string | null
          arquivo_nome: string
          bacc_code?: number | null
          baixado_em?: string | null
          banco_pagador?: string | null
          candidatos_json?: Json
          created_at?: string
          data_pagamento?: string | null
          empresa_detectada?: string | null
          enviado_por?: string | null
          erro?: string | null
          execucao_id?: string | null
          extraido_json?: Json
          favorecido_documento?: string | null
          favorecido_nome?: string | null
          fingerprint?: string | null
          grm_nf_lancamento_id?: string | null
          grm_resposta?: Json | null
          id?: string
          parcela_valor_total?: number | null
          pat_code?: number | null
          pin_code?: string | null
          pin_codes_json?: Json
          processado_em?: string | null
          saldo_pendente?: number
          status?: string
          storage_bucket?: string
          storage_path: string
          tentativas?: number
          updated_at?: string
          validacao_erros?: Json
          valor?: number | null
        }
        Update: {
          agencia_conta_pagador?: string | null
          arquivo_mime_type?: string | null
          arquivo_nome?: string
          bacc_code?: number | null
          baixado_em?: string | null
          banco_pagador?: string | null
          candidatos_json?: Json
          created_at?: string
          data_pagamento?: string | null
          empresa_detectada?: string | null
          enviado_por?: string | null
          erro?: string | null
          execucao_id?: string | null
          extraido_json?: Json
          favorecido_documento?: string | null
          favorecido_nome?: string | null
          fingerprint?: string | null
          grm_nf_lancamento_id?: string | null
          grm_resposta?: Json | null
          id?: string
          parcela_valor_total?: number | null
          pat_code?: number | null
          pin_code?: string | null
          pin_codes_json?: Json
          processado_em?: string | null
          saldo_pendente?: number
          status?: string
          storage_bucket?: string
          storage_path?: string
          tentativas?: number
          updated_at?: string
          validacao_erros?: Json
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grm_nf_baixas_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "grm_nf_baixa_execucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grm_nf_baixas_grm_nf_lancamento_id_fkey"
            columns: ["grm_nf_lancamento_id"]
            isOneToOne: false
            referencedRelation: "grm_nf_lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      grm_nf_catalogo: {
        Row: {
          atualizado_em: string
          grupo: string
          nome: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          grupo?: string
          nome: string
          tipo: string
        }
        Update: {
          atualizado_em?: string
          grupo?: string
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      grm_nf_lancamento_execucoes: {
        Row: {
          created_at: string
          dry_run: boolean
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          resumo: Json
          status: string
        }
        Insert: {
          created_at?: string
          dry_run?: boolean
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          resumo?: Json
          status?: string
        }
        Update: {
          created_at?: string
          dry_run?: boolean
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          resumo?: Json
          status?: string
        }
        Relationships: []
      }
      grm_nf_lancamentos: {
        Row: {
          ajustes_manuais: Json | null
          arquivo_mime_type: string | null
          arquivo_nome: string
          categoria: string | null
          created_at: string
          data_emissao: string | null
          data_vencimento: string | null
          enviado_por: string | null
          erro: string | null
          execucao_id: string | null
          extraido_json: Json
          fingerprint: string | null
          forma_pagamento: string | null
          fornecedor_cnpj: string | null
          fornecedor_nome: string | null
          grm_codigo: string | null
          grm_grupo: string | null
          grm_resposta: Json | null
          grupo_categoria: string | null
          id: string
          lancado_em: string | null
          numero_documento: string | null
          origem_extracao: string | null
          processado_em: string | null
          rh_folha_id: string | null
          setor: string | null
          status: string
          storage_bucket: string
          storage_path: string
          tentativas: number
          updated_at: string
          validacao_erros: Json
          valor_total: number | null
        }
        Insert: {
          ajustes_manuais?: Json | null
          arquivo_mime_type?: string | null
          arquivo_nome: string
          categoria?: string | null
          created_at?: string
          data_emissao?: string | null
          data_vencimento?: string | null
          enviado_por?: string | null
          erro?: string | null
          execucao_id?: string | null
          extraido_json?: Json
          fingerprint?: string | null
          forma_pagamento?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          grm_codigo?: string | null
          grm_grupo?: string | null
          grm_resposta?: Json | null
          grupo_categoria?: string | null
          id?: string
          lancado_em?: string | null
          numero_documento?: string | null
          origem_extracao?: string | null
          processado_em?: string | null
          rh_folha_id?: string | null
          setor?: string | null
          status?: string
          storage_bucket?: string
          storage_path: string
          tentativas?: number
          updated_at?: string
          validacao_erros?: Json
          valor_total?: number | null
        }
        Update: {
          ajustes_manuais?: Json | null
          arquivo_mime_type?: string | null
          arquivo_nome?: string
          categoria?: string | null
          created_at?: string
          data_emissao?: string | null
          data_vencimento?: string | null
          enviado_por?: string | null
          erro?: string | null
          execucao_id?: string | null
          extraido_json?: Json
          fingerprint?: string | null
          forma_pagamento?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          grm_codigo?: string | null
          grm_grupo?: string | null
          grm_resposta?: Json | null
          grupo_categoria?: string | null
          id?: string
          lancado_em?: string | null
          numero_documento?: string | null
          origem_extracao?: string | null
          processado_em?: string | null
          rh_folha_id?: string | null
          setor?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          tentativas?: number
          updated_at?: string
          validacao_erros?: Json
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grm_nf_lancamentos_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "grm_nf_lancamento_execucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grm_nf_lancamentos_rh_folha_id_fkey"
            columns: ["rh_folha_id"]
            isOneToOne: false
            referencedRelation: "rh_folha"
            referencedColumns: ["id"]
          },
        ]
      }
      grm_nhe_importacoes: {
        Row: {
          created_at: string | null
          dados_json: Json | null
          data_sincronizacao: string | null
          id: string
          sincronizado_em: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grm_notas_fiscais_importacoes: {
        Row: {
          cliente_nacional: string | null
          created_at: string | null
          dados_json: Json | null
          data_fatura_ate: string | null
          data_fatura_de: string | null
          data_nota_ate: string | null
          data_nota_de: string | null
          data_nota_real: string | null
          data_sincronizacao: string | null
          empresa: string | null
          fatura: string | null
          id: string
          numero_nf: string | null
          sincronizado_em: string | null
          updated_at: string | null
          valor_nota_real: number | null
          valor_total: number | null
        }
        Insert: {
          cliente_nacional?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_fatura_ate?: string | null
          data_fatura_de?: string | null
          data_nota_ate?: string | null
          data_nota_de?: string | null
          data_nota_real?: string | null
          data_sincronizacao?: string | null
          empresa?: string | null
          fatura?: string | null
          id?: string
          numero_nf?: string | null
          sincronizado_em?: string | null
          updated_at?: string | null
          valor_nota_real?: number | null
          valor_total?: number | null
        }
        Update: {
          cliente_nacional?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_fatura_ate?: string | null
          data_fatura_de?: string | null
          data_nota_ate?: string | null
          data_nota_de?: string | null
          data_nota_real?: string | null
          data_sincronizacao?: string | null
          empresa?: string | null
          fatura?: string | null
          id?: string
          numero_nf?: string | null
          sincronizado_em?: string | null
          updated_at?: string | null
          valor_nota_real?: number | null
          valor_total?: number | null
        }
        Relationships: []
      }
      grm_notas_fiscais_importacoes_backup_20260824: {
        Row: {
          cliente_nacional: string | null
          created_at: string | null
          dados_json: Json | null
          data_fatura_ate: string | null
          data_fatura_de: string | null
          data_nota_ate: string | null
          data_nota_de: string | null
          data_nota_real: string | null
          data_sincronizacao: string | null
          id: string | null
          numero_nf: string | null
          sincronizado_em: string | null
          updated_at: string | null
          valor_nota_real: number | null
          valor_total: number | null
        }
        Insert: {
          cliente_nacional?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_fatura_ate?: string | null
          data_fatura_de?: string | null
          data_nota_ate?: string | null
          data_nota_de?: string | null
          data_nota_real?: string | null
          data_sincronizacao?: string | null
          id?: string | null
          numero_nf?: string | null
          sincronizado_em?: string | null
          updated_at?: string | null
          valor_nota_real?: number | null
          valor_total?: number | null
        }
        Update: {
          cliente_nacional?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_fatura_ate?: string | null
          data_fatura_de?: string | null
          data_nota_ate?: string | null
          data_nota_de?: string | null
          data_nota_real?: string | null
          data_sincronizacao?: string | null
          id?: string | null
          numero_nf?: string | null
          sincronizado_em?: string | null
          updated_at?: string | null
          valor_nota_real?: number | null
          valor_total?: number | null
        }
        Relationships: []
      }
      grm_patrimonios_importacoes: {
        Row: {
          created_at: string | null
          dados_json: Json | null
          data_sincronizacao: string | null
          id: string
          sincronizado_em: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          id?: string
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grm_producao_diaria_importacoes: {
        Row: {
          created_at: string | null
          dados_json: Json | null
          data_sincronizacao: string | null
          dia: string | null
          funcionario: string | null
          id: string
          os: string | null
          periodo_ate: string | null
          periodo_de: string | null
          producao: number | null
          sincronizado_em: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          dia?: string | null
          funcionario?: string | null
          id?: string
          os?: string | null
          periodo_ate?: string | null
          periodo_de?: string | null
          producao?: number | null
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dados_json?: Json | null
          data_sincronizacao?: string | null
          dia?: string | null
          funcionario?: string | null
          id?: string
          os?: string | null
          periodo_ate?: string | null
          periodo_de?: string | null
          producao?: number | null
          sincronizado_em?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grm_reabertura_os_execucoes: {
        Row: {
          detalhes: Json
          dry_run: boolean
          erro: string | null
          fila_id: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          os: string
          status: string
        }
        Insert: {
          detalhes?: Json
          dry_run?: boolean
          erro?: string | null
          fila_id?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          os: string
          status?: string
        }
        Update: {
          detalhes?: Json
          dry_run?: boolean
          erro?: string | null
          fila_id?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          os?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "grm_reabertura_os_execucoes_fila_id_fkey"
            columns: ["fila_id"]
            isOneToOne: false
            referencedRelation: "grm_reabertura_os_fila"
            referencedColumns: ["id"]
          },
        ]
      }
      grm_reabertura_os_fila: {
        Row: {
          created_at: string
          criterio_fechamento: string | null
          data_os: string | null
          dias_sem_embarque: number | null
          dias_sem_fob: number | null
          erro: string | null
          fechamento_data: string
          fechamento_em: string
          id: string
          motivos: string[]
          observacao: string | null
          os: string
          prioridade: number
          reaberto_em: string | null
          regra_snapshot: Json
          remanescente: number | null
          resultado_fechamento_id: number | null
          servico: string | null
          snapshot_lista_os_em: string | null
          status: string
          tentativas: number
          ultimo_embarque: string | null
          ultimo_fob: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          criterio_fechamento?: string | null
          data_os?: string | null
          dias_sem_embarque?: number | null
          dias_sem_fob?: number | null
          erro?: string | null
          fechamento_data: string
          fechamento_em: string
          id?: string
          motivos?: string[]
          observacao?: string | null
          os: string
          prioridade?: number
          reaberto_em?: string | null
          regra_snapshot?: Json
          remanescente?: number | null
          resultado_fechamento_id?: number | null
          servico?: string | null
          snapshot_lista_os_em?: string | null
          status?: string
          tentativas?: number
          ultimo_embarque?: string | null
          ultimo_fob?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          criterio_fechamento?: string | null
          data_os?: string | null
          dias_sem_embarque?: number | null
          dias_sem_fob?: number | null
          erro?: string | null
          fechamento_data?: string
          fechamento_em?: string
          id?: string
          motivos?: string[]
          observacao?: string | null
          os?: string
          prioridade?: number
          reaberto_em?: string | null
          regra_snapshot?: Json
          remanescente?: number | null
          resultado_fechamento_id?: number | null
          servico?: string | null
          snapshot_lista_os_em?: string | null
          status?: string
          tentativas?: number
          ultimo_embarque?: string | null
          ultimo_fob?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grm_reabertura_os_fila_resultado_fechamento_id_fkey"
            columns: ["resultado_fechamento_id"]
            isOneToOne: false
            referencedRelation: "grm_finalizacao_os_resultados"
            referencedColumns: ["id"]
          },
        ]
      }
      grm_resultado_diario_importacoes: {
        Row: {
          cliente_nacional: string | null
          coordenacao: string | null
          created_at: string | null
          dados_json: Json | null
          data_classificacao_ate: string | null
          data_classificacao_de: string | null
          data_sincronizacao: string | null
          id: string
          incluir_valores: string | null
          produto: string | null
          resultado: number | null
          sincronizado_em: string | null
          uf_destino: string | null
          uf_embarque: string | null
          updated_at: string | null
        }
        Insert: {
          cliente_nacional?: string | null
          coordenacao?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_classificacao_ate?: string | null
          data_classificacao_de?: string | null
          data_sincronizacao?: string | null
          id?: string
          incluir_valores?: string | null
          produto?: string | null
          resultado?: number | null
          sincronizado_em?: string | null
          uf_destino?: string | null
          uf_embarque?: string | null
          updated_at?: string | null
        }
        Update: {
          cliente_nacional?: string | null
          coordenacao?: string | null
          created_at?: string | null
          dados_json?: Json | null
          data_classificacao_ate?: string | null
          data_classificacao_de?: string | null
          data_sincronizacao?: string | null
          id?: string
          incluir_valores?: string | null
          produto?: string | null
          resultado?: number | null
          sincronizado_em?: string | null
          uf_destino?: string | null
          uf_embarque?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grm_servicos_continuos_estado: {
        Row: {
          alertado_em: string | null
          problema_desde: string | null
          servico: string
        }
        Insert: {
          alertado_em?: string | null
          problema_desde?: string | null
          servico: string
        }
        Update: {
          alertado_em?: string | null
          problema_desde?: string | null
          servico?: string
        }
        Relationships: []
      }
      grm_sync_agent_settings: {
        Row: {
          agent_id: string
          depends_on: Json
          direction: string | null
          enabled: boolean
          interval_minutes: number
          legacy_lane_before_v2: string | null
          max_runtime_minutes: number
          mutex_group: string | null
          priority: number
          queue_lane: string
          resource_class: string | null
          target_lane: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_id: string
          depends_on?: Json
          direction?: string | null
          enabled?: boolean
          interval_minutes?: number
          legacy_lane_before_v2?: string | null
          max_runtime_minutes?: number
          mutex_group?: string | null
          priority?: number
          queue_lane: string
          resource_class?: string | null
          target_lane?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_id?: string
          depends_on?: Json
          direction?: string | null
          enabled?: boolean
          interval_minutes?: number
          legacy_lane_before_v2?: string | null
          max_runtime_minutes?: number
          mutex_group?: string | null
          priority?: number
          queue_lane?: string
          resource_class?: string | null
          target_lane?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grm_sync_agent_settings_target_lane_fkey"
            columns: ["target_lane"]
            isOneToOne: false
            referencedRelation: "grm_sync_lanes"
            referencedColumns: ["lane"]
          },
        ]
      }
      grm_sync_cutover_history: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: number
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: number
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: number
        }
        Relationships: []
      }
      grm_sync_jobs: {
        Row: {
          agente_id: string
          created_at: string
          duration_ms: number | null
          erro: string | null
          finalizado_em: string | null
          heartbeat_at: string | null
          id: string
          iniciado_em: string | null
          lane: string | null
          lease_expires_at: string | null
          memory_peak_mb: number | null
          output: Json | null
          payload: Json | null
          pipeline_seq: number | null
          solicitado_em: string
          solicitado_por: string | null
          status: string
          tentativas: number
          updated_at: string
          vps_disk_total_mb: number | null
          vps_disk_used_mb: number | null
          vps_memory_peak_mb: number | null
          vps_memory_total_mb: number | null
          worker_id: string | null
        }
        Insert: {
          agente_id: string
          created_at?: string
          duration_ms?: number | null
          erro?: string | null
          finalizado_em?: string | null
          heartbeat_at?: string | null
          id?: string
          iniciado_em?: string | null
          lane?: string | null
          lease_expires_at?: string | null
          memory_peak_mb?: number | null
          output?: Json | null
          payload?: Json | null
          pipeline_seq?: number | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tentativas?: number
          updated_at?: string
          vps_disk_total_mb?: number | null
          vps_disk_used_mb?: number | null
          vps_memory_peak_mb?: number | null
          vps_memory_total_mb?: number | null
          worker_id?: string | null
        }
        Update: {
          agente_id?: string
          created_at?: string
          duration_ms?: number | null
          erro?: string | null
          finalizado_em?: string | null
          heartbeat_at?: string | null
          id?: string
          iniciado_em?: string | null
          lane?: string | null
          lease_expires_at?: string | null
          memory_peak_mb?: number | null
          output?: Json | null
          payload?: Json | null
          pipeline_seq?: number | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tentativas?: number
          updated_at?: string
          vps_disk_total_mb?: number | null
          vps_disk_used_mb?: number | null
          vps_memory_peak_mb?: number | null
          vps_memory_total_mb?: number | null
          worker_id?: string | null
        }
        Relationships: []
      }
      grm_sync_lanes: {
        Row: {
          created_at: string
          description: string | null
          direction: string
          enabled: boolean
          label: string
          lane: string
          legacy_lane: string | null
          max_concurrency: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          direction: string
          enabled?: boolean
          label: string
          lane: string
          legacy_lane?: string | null
          max_concurrency?: number
          sort_order: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          direction?: string
          enabled?: boolean
          label?: string
          lane?: string
          legacy_lane?: string | null
          max_concurrency?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      grm_sync_runtime_policy: {
        Row: {
          active_version: number
          cutover_at: string | null
          id: number
          max_heavy_concurrent: number
          max_workers: number
          min_free_memory_mb: number
          updated_at: string
        }
        Insert: {
          active_version?: number
          cutover_at?: string | null
          id: number
          max_heavy_concurrent?: number
          max_workers?: number
          min_free_memory_mb?: number
          updated_at?: string
        }
        Update: {
          active_version?: number
          cutover_at?: string | null
          id?: number
          max_heavy_concurrent?: number
          max_workers?: number
          min_free_memory_mb?: number
          updated_at?: string
        }
        Relationships: []
      }
      grm_token_entregas: {
        Row: {
          aplicado_em: string | null
          enviado_em: string
          enviado_por: string | null
          id: string
          mensagem: string | null
          status: string
          tentativas: number
          token: string | null
          token_exp: string | null
          user_code: string | null
          user_email: string | null
        }
        Insert: {
          aplicado_em?: string | null
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          mensagem?: string | null
          status?: string
          tentativas?: number
          token?: string | null
          token_exp?: string | null
          user_code?: string | null
          user_email?: string | null
        }
        Update: {
          aplicado_em?: string | null
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          mensagem?: string | null
          status?: string
          tentativas?: number
          token?: string | null
          token_exp?: string | null
          user_code?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      grm_veiculo_catalogo: {
        Row: {
          atualizado_em: string
          marca: string
          modelo: string | null
          pbr_code: number
          pmo_code: number
        }
        Insert: {
          atualizado_em?: string
          marca: string
          modelo?: string | null
          pbr_code: number
          pmo_code?: number
        }
        Update: {
          atualizado_em?: string
          marca?: string
          modelo?: string | null
          pbr_code?: number
          pmo_code?: number
        }
        Relationships: []
      }
      historico_colaboradores: {
        Row: {
          admissao: string | null
          ativo: boolean
          bairro: string | null
          cargo: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          conta_bancaria_despesas: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string | null
          data_nascimento: string | null
          data_referencia: string
          desligamento: string | null
          email_empresa: string | null
          email_pessoal: string | null
          empresa: string | null
          endereco: string | null
          estado: string | null
          id: number
          importacao_id: string | null
          nome: string | null
          origem: string | null
          salario: string | null
          situacao: string | null
          snapshot_json: Json | null
          supervisao: string | null
          tipo: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          admissao?: string | null
          ativo?: boolean
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria_despesas?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          data_referencia: string
          desligamento?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: number
          importacao_id?: string | null
          nome?: string | null
          origem?: string | null
          salario?: string | null
          situacao?: string | null
          snapshot_json?: Json | null
          supervisao?: string | null
          tipo?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          admissao?: string | null
          ativo?: boolean
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria_despesas?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          data_referencia?: string
          desligamento?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: number
          importacao_id?: string | null
          nome?: string | null
          origem?: string | null
          salario?: string | null
          situacao?: string | null
          snapshot_json?: Json | null
          supervisao?: string | null
          tipo?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      hospedagem_adiantamento_movimentos: {
        Row: {
          adiantamento_id: string
          created_at: string
          criado_por: string | null
          id: string
          observacoes: string | null
          reserva_id: string | null
          tipo: string
          valor: number
        }
        Insert: {
          adiantamento_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
          observacoes?: string | null
          reserva_id?: string | null
          tipo: string
          valor: number
        }
        Update: {
          adiantamento_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          observacoes?: string | null
          reserva_id?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_adiantamento_movimentos_adiantamento_id_fkey"
            columns: ["adiantamento_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_adiantamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_adiantamento_movimentos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_adiantamento_movimentos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_adiantamentos: {
        Row: {
          created_at: string
          criado_por: string | null
          hotel_id: string
          id: string
          observacoes: string | null
          reserva_origem_id: string | null
          saldo: number
          status: string
          updated_at: string
          valor_creditado: number
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          hotel_id: string
          id?: string
          observacoes?: string | null
          reserva_origem_id?: string | null
          saldo: number
          status?: string
          updated_at?: string
          valor_creditado: number
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          hotel_id?: string
          id?: string
          observacoes?: string | null
          reserva_origem_id?: string | null
          saldo?: number
          status?: string
          updated_at?: string
          valor_creditado?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_adiantamentos_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_hoteis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_adiantamentos_reserva_origem_id_fkey"
            columns: ["reserva_origem_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_adiantamentos_reserva_origem_id_fkey"
            columns: ["reserva_origem_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_alojamentos: {
        Row: {
          agua: string | null
          agua_inclusa: boolean | null
          agua_matricula: string | null
          anexo_url: string | null
          anotacoes: Json
          atualizado_por: string | null
          bairro: string | null
          capacidade: number | null
          cep: string | null
          cidade: string
          contato: string | null
          contrato_fim: string | null
          contrato_inicio: string | null
          contrato_url: string | null
          created_at: string
          criado_por: string | null
          descricao_fatura: string | null
          empresa_internet: string | null
          endereco: string | null
          endereco_complemento: string | null
          endereco_logradouro: string | null
          endereco_numero: string | null
          energia: string | null
          energia_inclusa: boolean | null
          energia_matricula: string | null
          gas_forma_pagamento: string | null
          id: string
          internet: string | null
          internet_inclusa: boolean | null
          internet_matricula: string | null
          latitude: number | null
          link_localizacao: string | null
          longitude: number | null
          nome: string
          observacoes: string | null
          prioridade: string
          quartos: number | null
          referencia: string | null
          responsavel: string | null
          status: string
          supervisao: string | null
          supervisoes: string[]
          tipo: string
          uf: string
          updated_at: string
          valor_aluguel: number | null
          vencimento_agua: number | null
          vencimento_aluguel: number | null
          vencimento_energia: number | null
          vencimento_internet: number | null
        }
        Insert: {
          agua?: string | null
          agua_inclusa?: boolean | null
          agua_matricula?: string | null
          anexo_url?: string | null
          anotacoes?: Json
          atualizado_por?: string | null
          bairro?: string | null
          capacidade?: number | null
          cep?: string | null
          cidade: string
          contato?: string | null
          contrato_fim?: string | null
          contrato_inicio?: string | null
          contrato_url?: string | null
          created_at?: string
          criado_por?: string | null
          descricao_fatura?: string | null
          empresa_internet?: string | null
          endereco?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          energia?: string | null
          energia_inclusa?: boolean | null
          energia_matricula?: string | null
          gas_forma_pagamento?: string | null
          id?: string
          internet?: string | null
          internet_inclusa?: boolean | null
          internet_matricula?: string | null
          latitude?: number | null
          link_localizacao?: string | null
          longitude?: number | null
          nome: string
          observacoes?: string | null
          prioridade?: string
          quartos?: number | null
          referencia?: string | null
          responsavel?: string | null
          status?: string
          supervisao?: string | null
          supervisoes?: string[]
          tipo?: string
          uf: string
          updated_at?: string
          valor_aluguel?: number | null
          vencimento_agua?: number | null
          vencimento_aluguel?: number | null
          vencimento_energia?: number | null
          vencimento_internet?: number | null
        }
        Update: {
          agua?: string | null
          agua_inclusa?: boolean | null
          agua_matricula?: string | null
          anexo_url?: string | null
          anotacoes?: Json
          atualizado_por?: string | null
          bairro?: string | null
          capacidade?: number | null
          cep?: string | null
          cidade?: string
          contato?: string | null
          contrato_fim?: string | null
          contrato_inicio?: string | null
          contrato_url?: string | null
          created_at?: string
          criado_por?: string | null
          descricao_fatura?: string | null
          empresa_internet?: string | null
          endereco?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          energia?: string | null
          energia_inclusa?: boolean | null
          energia_matricula?: string | null
          gas_forma_pagamento?: string | null
          id?: string
          internet?: string | null
          internet_inclusa?: boolean | null
          internet_matricula?: string | null
          latitude?: number | null
          link_localizacao?: string | null
          longitude?: number | null
          nome?: string
          observacoes?: string | null
          prioridade?: string
          quartos?: number | null
          referencia?: string | null
          responsavel?: string | null
          status?: string
          supervisao?: string | null
          supervisoes?: string[]
          tipo?: string
          uf?: string
          updated_at?: string
          valor_aluguel?: number | null
          vencimento_agua?: number | null
          vencimento_aluguel?: number | null
          vencimento_energia?: number | null
          vencimento_internet?: number | null
        }
        Relationships: []
      }
      hospedagem_alteracoes: {
        Row: {
          created_at: string
          dados_solicitados: Json
          id: string
          nova_solicitacao_colaborador_id: string | null
          observacoes: string | null
          reserva_id: string
          solicitacao_colaborador_id: string
          solicitada_em: string
          solicitada_por: string
          status: string
          tipo: string
          tratada_em: string | null
          tratada_por: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dados_solicitados?: Json
          id?: string
          nova_solicitacao_colaborador_id?: string | null
          observacoes?: string | null
          reserva_id: string
          solicitacao_colaborador_id: string
          solicitada_em?: string
          solicitada_por: string
          status?: string
          tipo: string
          tratada_em?: string | null
          tratada_por?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dados_solicitados?: Json
          id?: string
          nova_solicitacao_colaborador_id?: string | null
          observacoes?: string | null
          reserva_id?: string
          solicitacao_colaborador_id?: string
          solicitada_em?: string
          solicitada_por?: string
          status?: string
          tipo?: string
          tratada_em?: string | null
          tratada_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_alteracoes_nova_solicitacao_colaborador_id_fkey"
            columns: ["nova_solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacao_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_alteracoes_nova_solicitacao_colaborador_id_fkey"
            columns: ["nova_solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "hospedagem_alteracoes_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_alteracoes_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_alteracoes_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacao_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_alteracoes_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["item_id"]
          },
        ]
      }
      hospedagem_anexos: {
        Row: {
          created_at: string | null
          enviado_por: string | null
          enviado_por_nome: string | null
          financeiro_id: string | null
          id: string
          mime_type: string | null
          nome_arquivo: string | null
          nota_id: string | null
          reserva_id: string | null
          solicitacao_id: string | null
          tamanho_bytes: number | null
          tipo_anexo: string
          url_arquivo: string
        }
        Insert: {
          created_at?: string | null
          enviado_por?: string | null
          enviado_por_nome?: string | null
          financeiro_id?: string | null
          id?: string
          mime_type?: string | null
          nome_arquivo?: string | null
          nota_id?: string | null
          reserva_id?: string | null
          solicitacao_id?: string | null
          tamanho_bytes?: number | null
          tipo_anexo: string
          url_arquivo: string
        }
        Update: {
          created_at?: string | null
          enviado_por?: string | null
          enviado_por_nome?: string | null
          financeiro_id?: string | null
          id?: string
          mime_type?: string | null
          nome_arquivo?: string | null
          nota_id?: string | null
          reserva_id?: string | null
          solicitacao_id?: string | null
          tamanho_bytes?: number | null
          tipo_anexo?: string
          url_arquivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_anexos_financeiro_id_fkey"
            columns: ["financeiro_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_financeiro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_anexos_financeiro_id_fkey"
            columns: ["financeiro_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["financeiro_id"]
          },
          {
            foreignKeyName: "hospedagem_anexos_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_notas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_anexos_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["nota_id"]
          },
          {
            foreignKeyName: "hospedagem_anexos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_anexos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_anexos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_canceladas"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_anexos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_minhas_solicitacoes"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_anexos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_anexos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_anexos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["solicitacao_id"]
          },
        ]
      }
      hospedagem_checkout_decisoes: {
        Row: {
          avisado_gestor_em: string | null
          confirmado_adm_em: string | null
          confirmado_hotel_em: string | null
          created_at: string
          data_checkout_prevista: string
          decisao: string | null
          dias_adicionais: number | null
          escalado_adm_em: string | null
          hotel_aceitou: boolean | null
          id: string
          reserva_id: string
          respondido_em: string | null
          resposta_hotel: string | null
          solicitacao_colaborador_id: string
          status: string
          updated_at: string
        }
        Insert: {
          avisado_gestor_em?: string | null
          confirmado_adm_em?: string | null
          confirmado_hotel_em?: string | null
          created_at?: string
          data_checkout_prevista: string
          decisao?: string | null
          dias_adicionais?: number | null
          escalado_adm_em?: string | null
          hotel_aceitou?: boolean | null
          id?: string
          reserva_id: string
          respondido_em?: string | null
          resposta_hotel?: string | null
          solicitacao_colaborador_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          avisado_gestor_em?: string | null
          confirmado_adm_em?: string | null
          confirmado_hotel_em?: string | null
          created_at?: string
          data_checkout_prevista?: string
          decisao?: string | null
          dias_adicionais?: number | null
          escalado_adm_em?: string | null
          hotel_aceitou?: boolean | null
          id?: string
          reserva_id?: string
          respondido_em?: string | null
          resposta_hotel?: string | null
          solicitacao_colaborador_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_checkout_decisoes_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_checkout_decisoes_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_checkout_decisoes_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacao_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_checkout_decisoes_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["item_id"]
          },
        ]
      }
      hospedagem_checkout_lote_colaboradores: {
        Row: {
          lote_id: string
          nome_colaborador: string
          reserva_colaborador_id: string | null
          solicitacao_colaborador_id: string | null
        }
        Insert: {
          lote_id: string
          nome_colaborador: string
          reserva_colaborador_id?: string | null
          solicitacao_colaborador_id?: string | null
        }
        Update: {
          lote_id?: string
          nome_colaborador?: string
          reserva_colaborador_id?: string | null
          solicitacao_colaborador_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_checkout_lote_colab_solicitacao_fk"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacao_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_checkout_lote_colab_solicitacao_fk"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "hospedagem_checkout_lote_colaboradores_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_checkout_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_checkout_lotes: {
        Row: {
          created_at: string
          data_checkout: string
          hotel_id: string | null
          id: string
          observacoes: string | null
          reserva_id: string
          status: string
          updated_at: string
          valor_diarias: number
          valor_extras: number
          valor_total: number
        }
        Insert: {
          created_at?: string
          data_checkout?: string
          hotel_id?: string | null
          id?: string
          observacoes?: string | null
          reserva_id: string
          status?: string
          updated_at?: string
          valor_diarias?: number
          valor_extras?: number
          valor_total?: number
        }
        Update: {
          created_at?: string
          data_checkout?: string
          hotel_id?: string | null
          id?: string
          observacoes?: string | null
          reserva_id?: string
          status?: string
          updated_at?: string
          valor_diarias?: number
          valor_extras?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_checkout_lotes_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_hoteis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_checkout_lotes_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_checkout_lotes_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_cotacao_colaboradores: {
        Row: {
          atendido: boolean | null
          cotacao_id: string
          created_at: string
          solicitacao_colaborador_id: string
        }
        Insert: {
          atendido?: boolean | null
          cotacao_id: string
          created_at?: string
          solicitacao_colaborador_id: string
        }
        Update: {
          atendido?: boolean | null
          cotacao_id?: string
          created_at?: string
          solicitacao_colaborador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_cotacao_colaboradore_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacao_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_cotacao_colaboradore_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "hospedagem_cotacao_colaboradores_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_cotacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_cotacoes: {
        Row: {
          aceita_pagamento_checkout: boolean | null
          almoco_incluso: boolean | null
          cafe_incluso: boolean | null
          composicao_quartos: string | null
          created_at: string
          criado_por: string | null
          diarias_previstas: number | null
          disponibilidade: boolean | null
          disponibilidade_quartos: Json
          emite_nota_fiscal: boolean | null
          enviado_em: string | null
          erro_envio: string | null
          estacionamento_incluso: boolean | null
          formas_pagamento: Json
          hotel_id: string
          hotel_nome: string | null
          id: string
          janta_inclusa: boolean | null
          mensagem_enviada: string | null
          observacoes: string | null
          quantidade_pessoas: number | null
          quantidade_quartos: number | null
          respondido_em: string | null
          resposta_dados: Json | null
          resposta_flow_id: string | null
          resposta_texto: string | null
          selecionada: boolean
          selecionada_em: string | null
          solicitacao_id: string
          status: string
          updated_at: string
          valor_diaria: number | null
          valor_total: number | null
        }
        Insert: {
          aceita_pagamento_checkout?: boolean | null
          almoco_incluso?: boolean | null
          cafe_incluso?: boolean | null
          composicao_quartos?: string | null
          created_at?: string
          criado_por?: string | null
          diarias_previstas?: number | null
          disponibilidade?: boolean | null
          disponibilidade_quartos?: Json
          emite_nota_fiscal?: boolean | null
          enviado_em?: string | null
          erro_envio?: string | null
          estacionamento_incluso?: boolean | null
          formas_pagamento?: Json
          hotel_id: string
          hotel_nome?: string | null
          id?: string
          janta_inclusa?: boolean | null
          mensagem_enviada?: string | null
          observacoes?: string | null
          quantidade_pessoas?: number | null
          quantidade_quartos?: number | null
          respondido_em?: string | null
          resposta_dados?: Json | null
          resposta_flow_id?: string | null
          resposta_texto?: string | null
          selecionada?: boolean
          selecionada_em?: string | null
          solicitacao_id: string
          status?: string
          updated_at?: string
          valor_diaria?: number | null
          valor_total?: number | null
        }
        Update: {
          aceita_pagamento_checkout?: boolean | null
          almoco_incluso?: boolean | null
          cafe_incluso?: boolean | null
          composicao_quartos?: string | null
          created_at?: string
          criado_por?: string | null
          diarias_previstas?: number | null
          disponibilidade?: boolean | null
          disponibilidade_quartos?: Json
          emite_nota_fiscal?: boolean | null
          enviado_em?: string | null
          erro_envio?: string | null
          estacionamento_incluso?: boolean | null
          formas_pagamento?: Json
          hotel_id?: string
          hotel_nome?: string | null
          id?: string
          janta_inclusa?: boolean | null
          mensagem_enviada?: string | null
          observacoes?: string | null
          quantidade_pessoas?: number | null
          quantidade_quartos?: number | null
          respondido_em?: string | null
          resposta_dados?: Json | null
          resposta_flow_id?: string | null
          resposta_texto?: string | null
          selecionada?: boolean
          selecionada_em?: string | null
          solicitacao_id?: string
          status?: string
          updated_at?: string
          valor_diaria?: number | null
          valor_total?: number | null
        }
        Relationships: []
      }
      hospedagem_custos_extras: {
        Row: {
          anexo_url: string | null
          autorizado_por: string | null
          autorizado_por_nome: string | null
          created_at: string
          data_custo: string
          descricao: string
          enviar_conferencia: boolean
          id: string
          observacoes: string | null
          quantidade: number
          reserva_id: string | null
          solicitacao_id: string
          status_conferencia: string
          tipo: string
          updated_at: string
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          anexo_url?: string | null
          autorizado_por?: string | null
          autorizado_por_nome?: string | null
          created_at?: string
          data_custo?: string
          descricao: string
          enviar_conferencia?: boolean
          id?: string
          observacoes?: string | null
          quantidade?: number
          reserva_id?: string | null
          solicitacao_id: string
          status_conferencia?: string
          tipo?: string
          updated_at?: string
          valor_total?: number
          valor_unitario?: number
        }
        Update: {
          anexo_url?: string | null
          autorizado_por?: string | null
          autorizado_por_nome?: string | null
          created_at?: string
          data_custo?: string
          descricao?: string
          enviar_conferencia?: boolean
          id?: string
          observacoes?: string | null
          quantidade?: number
          reserva_id?: string | null
          solicitacao_id?: string
          status_conferencia?: string
          tipo?: string
          updated_at?: string
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: []
      }
      hospedagem_diferencas_colaborador: {
        Row: {
          created_at: string
          criado_por: string | null
          id: string
          observacoes: string | null
          reserva_id: string
          solicitacao_colaborador_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          id?: string
          observacoes?: string | null
          reserva_id: string
          solicitacao_colaborador_id: string
          valor: number
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          id?: string
          observacoes?: string | null
          reserva_id?: string
          solicitacao_colaborador_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_diferencas_colaborad_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacao_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_diferencas_colaborad_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "hospedagem_diferencas_colaborador_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_diferencas_colaborador_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_documentos: {
        Row: {
          arquivo_url: string
          botconversa_destinatario: string | null
          botconversa_enviado_em: string | null
          created_at: string
          criado_por: string | null
          external_message_id: string | null
          id: string
          mime_type: string | null
          nome_arquivo: string | null
          observacoes: string | null
          origem: string
          recebido_em: string | null
          reserva_id: string | null
          solicitacao_id: string
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          arquivo_url: string
          botconversa_destinatario?: string | null
          botconversa_enviado_em?: string | null
          created_at?: string
          criado_por?: string | null
          external_message_id?: string | null
          id?: string
          mime_type?: string | null
          nome_arquivo?: string | null
          observacoes?: string | null
          origem?: string
          recebido_em?: string | null
          reserva_id?: string | null
          solicitacao_id: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          arquivo_url?: string
          botconversa_destinatario?: string | null
          botconversa_enviado_em?: string | null
          created_at?: string
          criado_por?: string | null
          external_message_id?: string | null
          id?: string
          mime_type?: string | null
          nome_arquivo?: string | null
          observacoes?: string | null
          origem?: string
          recebido_em?: string | null
          reserva_id?: string | null
          solicitacao_id?: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      hospedagem_empresas_fiscais: {
        Row: {
          ativo: boolean
          cnpj: string
          created_at: string
          empresa: string
          id: string
          razao_social: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj: string
          created_at?: string
          empresa: string
          id?: string
          razao_social: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string
          created_at?: string
          empresa?: string
          id?: string
          razao_social?: string
          updated_at?: string
        }
        Relationships: []
      }
      hospedagem_eventos: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          payload: Json | null
          reserva_id: string | null
          solicitacao_id: string | null
          status_anterior: string | null
          status_novo: string | null
          tipo_evento: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          payload?: Json | null
          reserva_id?: string | null
          solicitacao_id?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          tipo_evento: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          payload?: Json | null
          reserva_id?: string | null
          solicitacao_id?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          tipo_evento?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_eventos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_eventos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_eventos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_canceladas"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_eventos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_minhas_solicitacoes"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_eventos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_eventos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_eventos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["solicitacao_id"]
          },
        ]
      }
      hospedagem_extra_rateios: {
        Row: {
          created_at: string
          criado_por: string | null
          custo_extra_id: string
          id: string
          lancamento_caixa_id: string | null
          solicitacao_colaborador_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          custo_extra_id: string
          id?: string
          lancamento_caixa_id?: string | null
          solicitacao_colaborador_id: string
          valor: number
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          custo_extra_id?: string
          id?: string
          lancamento_caixa_id?: string | null
          solicitacao_colaborador_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_extra_rateios_custo_extra_id_fkey"
            columns: ["custo_extra_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_custos_extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_extra_rateios_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacao_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_extra_rateios_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["item_id"]
          },
        ]
      }
      hospedagem_financeiro: {
        Row: {
          adiantamento_gerado: number
          classificacao_pagamento: string | null
          comprovante_enviado_em: string | null
          comprovante_pagamento_url: string | null
          comprovante_url: string | null
          condicao_pagamento: string | null
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          enviado_financeiro_em: string | null
          forma_pagamento: string | null
          id: string
          observacao_financeiro: string | null
          origem_pagamento: string | null
          pagamento_parcial: boolean
          pago_em: string | null
          reserva_id: string
          responsavel_pagamento: string | null
          responsavel_pagamento_id: string | null
          saldo: number | null
          status_financeiro: string | null
          taxa_bancaria: number
          updated_at: string | null
          valor_comprovante: number | null
          valor_original: number | null
          valor_pago: number | null
          valor_total: number
        }
        Insert: {
          adiantamento_gerado?: number
          classificacao_pagamento?: string | null
          comprovante_enviado_em?: string | null
          comprovante_pagamento_url?: string | null
          comprovante_url?: string | null
          condicao_pagamento?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          enviado_financeiro_em?: string | null
          forma_pagamento?: string | null
          id?: string
          observacao_financeiro?: string | null
          origem_pagamento?: string | null
          pagamento_parcial?: boolean
          pago_em?: string | null
          reserva_id: string
          responsavel_pagamento?: string | null
          responsavel_pagamento_id?: string | null
          saldo?: number | null
          status_financeiro?: string | null
          taxa_bancaria?: number
          updated_at?: string | null
          valor_comprovante?: number | null
          valor_original?: number | null
          valor_pago?: number | null
          valor_total?: number
        }
        Update: {
          adiantamento_gerado?: number
          classificacao_pagamento?: string | null
          comprovante_enviado_em?: string | null
          comprovante_pagamento_url?: string | null
          comprovante_url?: string | null
          condicao_pagamento?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          enviado_financeiro_em?: string | null
          forma_pagamento?: string | null
          id?: string
          observacao_financeiro?: string | null
          origem_pagamento?: string | null
          pagamento_parcial?: boolean
          pago_em?: string | null
          reserva_id?: string
          responsavel_pagamento?: string | null
          responsavel_pagamento_id?: string | null
          saldo?: number | null
          status_financeiro?: string | null
          taxa_bancaria?: number
          updated_at?: string | null
          valor_comprovante?: number | null
          valor_original?: number | null
          valor_pago?: number | null
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_financeiro_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_financeiro_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_historico_colaboradores: {
        Row: {
          aba_origem: string | null
          arquivo_origem: string | null
          cidade: string | null
          cliente: string | null
          colaborador: string
          created_at: string
          data: string
          hotel: string
          id: string
          linha_origem: number | null
          local_embarque: string | null
          localizacao: string | null
          nfs: string | null
          observacao: string | null
          raw: Json
          regional: string | null
          saldo: number | null
          situacao_pagamento: string | null
          status_hospedagem: string
          status_planilha: string | null
          tipo_quarto: string | null
          uf: string | null
          unique_hash: string
          updated_at: string
          valor_diaria: number | null
        }
        Insert: {
          aba_origem?: string | null
          arquivo_origem?: string | null
          cidade?: string | null
          cliente?: string | null
          colaborador: string
          created_at?: string
          data: string
          hotel: string
          id?: string
          linha_origem?: number | null
          local_embarque?: string | null
          localizacao?: string | null
          nfs?: string | null
          observacao?: string | null
          raw?: Json
          regional?: string | null
          saldo?: number | null
          situacao_pagamento?: string | null
          status_hospedagem?: string
          status_planilha?: string | null
          tipo_quarto?: string | null
          uf?: string | null
          unique_hash: string
          updated_at?: string
          valor_diaria?: number | null
        }
        Update: {
          aba_origem?: string | null
          arquivo_origem?: string | null
          cidade?: string | null
          cliente?: string | null
          colaborador?: string
          created_at?: string
          data?: string
          hotel?: string
          id?: string
          linha_origem?: number | null
          local_embarque?: string | null
          localizacao?: string | null
          nfs?: string | null
          observacao?: string | null
          raw?: Json
          regional?: string | null
          saldo?: number | null
          situacao_pagamento?: string | null
          status_hospedagem?: string
          status_planilha?: string | null
          tipo_quarto?: string | null
          uf?: string | null
          unique_hash?: string
          updated_at?: string
          valor_diaria?: number | null
        }
        Relationships: []
      }
      hospedagem_hoteis: {
        Row: {
          aceita_pagamento_checkout: boolean | null
          agencia: string | null
          atualizado_por: string | null
          avaliacao_interna: number | null
          bairro: string | null
          banco: string | null
          cep: string | null
          chave_importacao: string | null
          chave_pix: string | null
          cidade: string
          cnpj_cpf: string | null
          condicao_pagamento_padrao: string | null
          conta: string | null
          created_at: string | null
          criado_por: string | null
          email: string | null
          email_financeiro: string | null
          emite_nota_fiscal: boolean
          endereco: string | null
          estacionamento: boolean | null
          favorecido: string | null
          grupo_origem: string | null
          icone_origem: string | null
          id: string
          inclui_almoco: boolean | null
          inclui_cafe: boolean | null
          inclui_janta: boolean | null
          latitude: number | null
          link_maps: string | null
          longitude: number | null
          nome: string
          observacoes: string | null
          origem_importacao: string | null
          pix_chave: string | null
          prioridade: string | null
          razao_social: string | null
          recebe_cotacao: boolean
          status: string | null
          telefone: string | null
          tipo_conta: string | null
          uf: string
          ultima_importacao_em: string | null
          updated_at: string | null
          valor_diaria_duplo: number | null
          valor_diaria_individual: number | null
          valor_diaria_padrao: number | null
          valor_diaria_quadruplo: number | null
          valor_diaria_triplo: number | null
          whatsapp: string | null
          whatsapp_validado: boolean
        }
        Insert: {
          aceita_pagamento_checkout?: boolean | null
          agencia?: string | null
          atualizado_por?: string | null
          avaliacao_interna?: number | null
          bairro?: string | null
          banco?: string | null
          cep?: string | null
          chave_importacao?: string | null
          chave_pix?: string | null
          cidade: string
          cnpj_cpf?: string | null
          condicao_pagamento_padrao?: string | null
          conta?: string | null
          created_at?: string | null
          criado_por?: string | null
          email?: string | null
          email_financeiro?: string | null
          emite_nota_fiscal?: boolean
          endereco?: string | null
          estacionamento?: boolean | null
          favorecido?: string | null
          grupo_origem?: string | null
          icone_origem?: string | null
          id?: string
          inclui_almoco?: boolean | null
          inclui_cafe?: boolean | null
          inclui_janta?: boolean | null
          latitude?: number | null
          link_maps?: string | null
          longitude?: number | null
          nome: string
          observacoes?: string | null
          origem_importacao?: string | null
          pix_chave?: string | null
          prioridade?: string | null
          razao_social?: string | null
          recebe_cotacao?: boolean
          status?: string | null
          telefone?: string | null
          tipo_conta?: string | null
          uf: string
          ultima_importacao_em?: string | null
          updated_at?: string | null
          valor_diaria_duplo?: number | null
          valor_diaria_individual?: number | null
          valor_diaria_padrao?: number | null
          valor_diaria_quadruplo?: number | null
          valor_diaria_triplo?: number | null
          whatsapp?: string | null
          whatsapp_validado?: boolean
        }
        Update: {
          aceita_pagamento_checkout?: boolean | null
          agencia?: string | null
          atualizado_por?: string | null
          avaliacao_interna?: number | null
          bairro?: string | null
          banco?: string | null
          cep?: string | null
          chave_importacao?: string | null
          chave_pix?: string | null
          cidade?: string
          cnpj_cpf?: string | null
          condicao_pagamento_padrao?: string | null
          conta?: string | null
          created_at?: string | null
          criado_por?: string | null
          email?: string | null
          email_financeiro?: string | null
          emite_nota_fiscal?: boolean
          endereco?: string | null
          estacionamento?: boolean | null
          favorecido?: string | null
          grupo_origem?: string | null
          icone_origem?: string | null
          id?: string
          inclui_almoco?: boolean | null
          inclui_cafe?: boolean | null
          inclui_janta?: boolean | null
          latitude?: number | null
          link_maps?: string | null
          longitude?: number | null
          nome?: string
          observacoes?: string | null
          origem_importacao?: string | null
          pix_chave?: string | null
          prioridade?: string | null
          razao_social?: string | null
          recebe_cotacao?: boolean
          status?: string | null
          telefone?: string | null
          tipo_conta?: string | null
          uf?: string
          ultima_importacao_em?: string | null
          updated_at?: string | null
          valor_diaria_duplo?: number | null
          valor_diaria_individual?: number | null
          valor_diaria_padrao?: number | null
          valor_diaria_quadruplo?: number | null
          valor_diaria_triplo?: number | null
          whatsapp?: string | null
          whatsapp_validado?: boolean
        }
        Relationships: []
      }
      hospedagem_mensagens: {
        Row: {
          arquivo_url: string | null
          canal: string
          conteudo: string | null
          created_at: string
          destinatario: string | null
          direcao: string
          enviado_em: string | null
          erro: string | null
          external_message_id: string | null
          hotel_id: string | null
          id: string
          recebido_em: string | null
          remetente: string | null
          reserva_id: string | null
          solicitacao_id: string
          status: string
          tipo: string
        }
        Insert: {
          arquivo_url?: string | null
          canal?: string
          conteudo?: string | null
          created_at?: string
          destinatario?: string | null
          direcao?: string
          enviado_em?: string | null
          erro?: string | null
          external_message_id?: string | null
          hotel_id?: string | null
          id?: string
          recebido_em?: string | null
          remetente?: string | null
          reserva_id?: string | null
          solicitacao_id: string
          status?: string
          tipo?: string
        }
        Update: {
          arquivo_url?: string | null
          canal?: string
          conteudo?: string | null
          created_at?: string
          destinatario?: string | null
          direcao?: string
          enviado_em?: string | null
          erro?: string | null
          external_message_id?: string | null
          hotel_id?: string | null
          id?: string
          recebido_em?: string | null
          remetente?: string | null
          reserva_id?: string | null
          solicitacao_id?: string
          status?: string
          tipo?: string
        }
        Relationships: []
      }
      hospedagem_notas: {
        Row: {
          chave_acesso: string | null
          comprovante_url: string | null
          created_at: string | null
          data_emissao: string | null
          enviado_lancamento_em: string | null
          id: string
          lancado_em: string | null
          nf_recebida_em: string | null
          nf_solicitada_em: string | null
          nota_url: string | null
          numero_nf: string | null
          observacao: string | null
          reserva_id: string
          status_nota: string | null
          tipo_nota: string | null
          updated_at: string | null
          valor_nf: number | null
          xml_url: string | null
        }
        Insert: {
          chave_acesso?: string | null
          comprovante_url?: string | null
          created_at?: string | null
          data_emissao?: string | null
          enviado_lancamento_em?: string | null
          id?: string
          lancado_em?: string | null
          nf_recebida_em?: string | null
          nf_solicitada_em?: string | null
          nota_url?: string | null
          numero_nf?: string | null
          observacao?: string | null
          reserva_id: string
          status_nota?: string | null
          tipo_nota?: string | null
          updated_at?: string | null
          valor_nf?: number | null
          xml_url?: string | null
        }
        Update: {
          chave_acesso?: string | null
          comprovante_url?: string | null
          created_at?: string | null
          data_emissao?: string | null
          enviado_lancamento_em?: string | null
          id?: string
          lancado_em?: string | null
          nf_recebida_em?: string | null
          nf_solicitada_em?: string | null
          nota_url?: string | null
          numero_nf?: string | null
          observacao?: string | null
          reserva_id?: string
          status_nota?: string | null
          tipo_nota?: string | null
          updated_at?: string | null
          valor_nf?: number | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_notas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_notas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_outbox: {
        Row: {
          agendado_para: string
          chave_dedup: string
          created_at: string
          destinatario_id: string | null
          destinatario_tipo: string
          enviado_em: string | null
          external_message_id: string | null
          hotel_id: string | null
          id: string
          nome: string | null
          payload: Json
          reserva_id: string | null
          solicitacao_id: string | null
          status: string
          telefone: string | null
          template: string
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          agendado_para?: string
          chave_dedup: string
          created_at?: string
          destinatario_id?: string | null
          destinatario_tipo: string
          enviado_em?: string | null
          external_message_id?: string | null
          hotel_id?: string | null
          id?: string
          nome?: string | null
          payload?: Json
          reserva_id?: string | null
          solicitacao_id?: string | null
          status?: string
          telefone?: string | null
          template: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          agendado_para?: string
          chave_dedup?: string
          created_at?: string
          destinatario_id?: string | null
          destinatario_tipo?: string
          enviado_em?: string | null
          external_message_id?: string | null
          hotel_id?: string | null
          id?: string
          nome?: string | null
          payload?: Json
          reserva_id?: string | null
          solicitacao_id?: string | null
          status?: string
          telefone?: string | null
          template?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_outbox_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_hoteis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_outbox_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_outbox_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_outbox_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_canceladas"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_outbox_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_minhas_solicitacoes"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_outbox_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_outbox_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_outbox_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["solicitacao_id"]
          },
        ]
      }
      hospedagem_pagamento_documentos: {
        Row: {
          arquivo_url: string
          created_at: string
          emitente_cnpj: string | null
          grm_nf_lancamento_id: string | null
          id: string
          mime_type: string | null
          numero_nfse: string | null
          parcela_id: string
          periodo_fim: string | null
          periodo_inicio: string | null
          recebido_em: string
          status_validacao: string
          storage_bucket: string | null
          storage_path: string | null
          tipo: string
          tomador_cnpj: string | null
          tomador_razao_social: string | null
          validacao_erros: Json
          valor_nfse: number | null
        }
        Insert: {
          arquivo_url: string
          created_at?: string
          emitente_cnpj?: string | null
          grm_nf_lancamento_id?: string | null
          id?: string
          mime_type?: string | null
          numero_nfse?: string | null
          parcela_id: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          recebido_em?: string
          status_validacao?: string
          storage_bucket?: string | null
          storage_path?: string | null
          tipo: string
          tomador_cnpj?: string | null
          tomador_razao_social?: string | null
          validacao_erros?: Json
          valor_nfse?: number | null
        }
        Update: {
          arquivo_url?: string
          created_at?: string
          emitente_cnpj?: string | null
          grm_nf_lancamento_id?: string | null
          id?: string
          mime_type?: string | null
          numero_nfse?: string | null
          parcela_id?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          recebido_em?: string
          status_validacao?: string
          storage_bucket?: string | null
          storage_path?: string | null
          tipo?: string
          tomador_cnpj?: string | null
          tomador_razao_social?: string | null
          validacao_erros?: Json
          valor_nfse?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_pagamento_documentos_grm_nf_lancamento_id_fkey"
            columns: ["grm_nf_lancamento_id"]
            isOneToOne: false
            referencedRelation: "grm_nf_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_pagamento_documentos_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_pagamento_parcelas"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_pagamento_parcelas: {
        Row: {
          comprovante_enviado_hotel_em: string | null
          comprovante_url: string
          created_at: string
          data_pagamento: string
          id: string
          nfse_status: string
          pagamento_id: string
          pago_por: string | null
          pago_por_setor: string
          proxima_cobranca_nfse_em: string | null
          valor: number
        }
        Insert: {
          comprovante_enviado_hotel_em?: string | null
          comprovante_url: string
          created_at?: string
          data_pagamento: string
          id?: string
          nfse_status?: string
          pagamento_id: string
          pago_por?: string | null
          pago_por_setor: string
          proxima_cobranca_nfse_em?: string | null
          valor: number
        }
        Update: {
          comprovante_enviado_hotel_em?: string | null
          comprovante_url?: string
          created_at?: string
          data_pagamento?: string
          id?: string
          nfse_status?: string
          pagamento_id?: string
          pago_por?: string | null
          pago_por_setor?: string
          proxima_cobranca_nfse_em?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_pagamento_parcelas_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_pagamentos_v3"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_pagamentos_v3: {
        Row: {
          boleto_linha_digitavel: string | null
          boleto_url: string | null
          chave_pix: string | null
          created_at: string
          criado_por: string | null
          data_vencimento: string | null
          enviado_financeiro_em: string | null
          financeiro_pagamento_id: string | null
          forma_pagamento: string
          id: string
          origem_pagamento: string | null
          reserva_id: string
          saldo: number | null
          status: string
          updated_at: string
          valor_pago: number
          valor_total: number
        }
        Insert: {
          boleto_linha_digitavel?: string | null
          boleto_url?: string | null
          chave_pix?: string | null
          created_at?: string
          criado_por?: string | null
          data_vencimento?: string | null
          enviado_financeiro_em?: string | null
          financeiro_pagamento_id?: string | null
          forma_pagamento: string
          id?: string
          origem_pagamento?: string | null
          reserva_id: string
          saldo?: number | null
          status?: string
          updated_at?: string
          valor_pago?: number
          valor_total: number
        }
        Update: {
          boleto_linha_digitavel?: string | null
          boleto_url?: string | null
          chave_pix?: string | null
          created_at?: string
          criado_por?: string | null
          data_vencimento?: string | null
          enviado_financeiro_em?: string | null
          financeiro_pagamento_id?: string | null
          forma_pagamento?: string
          id?: string
          origem_pagamento?: string | null
          reserva_id?: string
          saldo?: number | null
          status?: string
          updated_at?: string
          valor_pago?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_pagamentos_v3_financeiro_pagamento_id_fkey"
            columns: ["financeiro_pagamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_pagamentos_v3_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_pagamentos_v3_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_producao_diarias: {
        Row: {
          cidade: string | null
          cliente: string | null
          created_at: string | null
          data: string
          funcionario: string
          hotel: string
          id: string
          importado_por: string | null
          local_trabalho: string | null
          localizacao: string | null
          nfs: string | null
          observacao: string | null
          regional: string | null
          saldo: number | null
          situacao_pgto: string | null
          status: string | null
          tipo_diaria: string | null
          valor_diaria: number | null
        }
        Insert: {
          cidade?: string | null
          cliente?: string | null
          created_at?: string | null
          data: string
          funcionario: string
          hotel: string
          id?: string
          importado_por?: string | null
          local_trabalho?: string | null
          localizacao?: string | null
          nfs?: string | null
          observacao?: string | null
          regional?: string | null
          saldo?: number | null
          situacao_pgto?: string | null
          status?: string | null
          tipo_diaria?: string | null
          valor_diaria?: number | null
        }
        Update: {
          cidade?: string | null
          cliente?: string | null
          created_at?: string | null
          data?: string
          funcionario?: string
          hotel?: string
          id?: string
          importado_por?: string | null
          local_trabalho?: string | null
          localizacao?: string | null
          nfs?: string | null
          observacao?: string | null
          regional?: string | null
          saldo?: number | null
          situacao_pgto?: string | null
          status?: string | null
          tipo_diaria?: string | null
          valor_diaria?: number | null
        }
        Relationships: []
      }
      hospedagem_reserva_codigo_sequencias: {
        Row: {
          ano: number
          mes: number
          ultimo_numero: number
          updated_at: string
        }
        Insert: {
          ano: number
          mes: number
          ultimo_numero?: number
          updated_at?: string
        }
        Update: {
          ano?: number
          mes?: number
          ultimo_numero?: number
          updated_at?: string
        }
        Relationships: []
      }
      hospedagem_reserva_colaboradores: {
        Row: {
          checkout_em: string | null
          checkout_por: string | null
          created_at: string
          reserva_id: string
          reserva_quarto_id: string | null
          solicitacao_colaborador_id: string
          status: string
          updated_at: string
        }
        Insert: {
          checkout_em?: string | null
          checkout_por?: string | null
          created_at?: string
          reserva_id: string
          reserva_quarto_id?: string | null
          solicitacao_colaborador_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          checkout_em?: string | null
          checkout_por?: string | null
          created_at?: string
          reserva_id?: string
          reserva_quarto_id?: string | null
          solicitacao_colaborador_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_reserva_colaboradore_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacao_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_colaboradore_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_colaboradores_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_colaboradores_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_colaboradores_reserva_quarto_id_fkey"
            columns: ["reserva_quarto_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reserva_quartos"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_reserva_pedido_colaboradores: {
        Row: {
          pedido_id: string
          solicitacao_colaborador_id: string
        }
        Insert: {
          pedido_id: string
          solicitacao_colaborador_id: string
        }
        Update: {
          pedido_id?: string
          solicitacao_colaborador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_reserva_pedido_colab_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacao_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_pedido_colab_solicitacao_colaborador_id_fkey"
            columns: ["solicitacao_colaborador_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_pedido_colaboradores_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reserva_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_reserva_pedidos: {
        Row: {
          cotacao_id: string | null
          created_at: string
          hotel_id: string
          id: string
          quartos: Json
          reserva_id: string | null
          respondido_em: string | null
          resposta_texto: string | null
          solicitacao_id: string
          solicitado_em: string
          solicitado_por: string | null
          status: string
          updated_at: string
          valor_diaria: number
        }
        Insert: {
          cotacao_id?: string | null
          created_at?: string
          hotel_id: string
          id?: string
          quartos?: Json
          reserva_id?: string | null
          respondido_em?: string | null
          resposta_texto?: string | null
          solicitacao_id: string
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          updated_at?: string
          valor_diaria: number
        }
        Update: {
          cotacao_id?: string | null
          created_at?: string
          hotel_id?: string
          id?: string
          quartos?: Json
          reserva_id?: string | null
          respondido_em?: string | null
          resposta_texto?: string | null
          solicitacao_id?: string
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          updated_at?: string
          valor_diaria?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_reserva_pedidos_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_pedidos_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_hoteis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_pedidos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_pedidos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_pedidos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_canceladas"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_pedidos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_minhas_solicitacoes"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_pedidos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_pedidos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_pedidos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["solicitacao_id"]
          },
        ]
      }
      hospedagem_reserva_quartos: {
        Row: {
          created_at: string
          genero: string | null
          id: string
          quantidade: number
          reserva_id: string
          tipo_quarto: string
          updated_at: string
          valor_diaria: number
        }
        Insert: {
          created_at?: string
          genero?: string | null
          id?: string
          quantidade?: number
          reserva_id: string
          tipo_quarto?: string
          updated_at?: string
          valor_diaria?: number
        }
        Update: {
          created_at?: string
          genero?: string | null
          id?: string
          quantidade?: number
          reserva_id?: string
          tipo_quarto?: string
          updated_at?: string
          valor_diaria?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_reserva_quartos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_quartos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_reserva_solicitacoes: {
        Row: {
          created_at: string
          reserva_id: string
          solicitacao_id: string
        }
        Insert: {
          created_at?: string
          reserva_id: string
          solicitacao_id: string
        }
        Update: {
          created_at?: string
          reserva_id?: string
          solicitacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_reserva_solicitacoes_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_solicitacoes_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_solicitacoes_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_canceladas"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_solicitacoes_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_minhas_solicitacoes"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_solicitacoes_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_solicitacoes_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reserva_solicitacoes_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["solicitacao_id"]
          },
        ]
      }
      hospedagem_reservas: {
        Row: {
          atualizado_por: string | null
          cidade_hotel: string | null
          codigo_ano: number | null
          codigo_operacional: string | null
          codigo_reserva_hotel: string | null
          comprovante_reserva_url: string | null
          confirmacao_origem: string | null
          confirmado_com: string | null
          confirmado_em: string | null
          contato_confirmacao: string | null
          created_at: string | null
          criado_por: string | null
          data_checkin: string
          data_checkout: string
          data_checkout_real: string | null
          estacionamento: boolean | null
          fluxo_versao: number
          horario_chegada: string | null
          hotel_id: string | null
          id: string
          inclui_almoco: boolean | null
          inclui_cafe: boolean | null
          inclui_janta: boolean | null
          link_reserva: string | null
          nome_hotel: string | null
          observacao_hospedagem: string | null
          quantidade_diarias: number
          quantidade_quartos: number | null
          solicitacao_id: string
          status_hospedagem: string | null
          tipo_quarto: string | null
          uf_hotel: string | null
          updated_at: string | null
          valor_diaria: number
          valor_total_final: number | null
          valor_total_previsto: number | null
        }
        Insert: {
          atualizado_por?: string | null
          cidade_hotel?: string | null
          codigo_ano?: number | null
          codigo_operacional?: string | null
          codigo_reserva_hotel?: string | null
          comprovante_reserva_url?: string | null
          confirmacao_origem?: string | null
          confirmado_com?: string | null
          confirmado_em?: string | null
          contato_confirmacao?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_checkin: string
          data_checkout: string
          data_checkout_real?: string | null
          estacionamento?: boolean | null
          fluxo_versao?: number
          horario_chegada?: string | null
          hotel_id?: string | null
          id?: string
          inclui_almoco?: boolean | null
          inclui_cafe?: boolean | null
          inclui_janta?: boolean | null
          link_reserva?: string | null
          nome_hotel?: string | null
          observacao_hospedagem?: string | null
          quantidade_diarias?: number
          quantidade_quartos?: number | null
          solicitacao_id: string
          status_hospedagem?: string | null
          tipo_quarto?: string | null
          uf_hotel?: string | null
          updated_at?: string | null
          valor_diaria?: number
          valor_total_final?: number | null
          valor_total_previsto?: number | null
        }
        Update: {
          atualizado_por?: string | null
          cidade_hotel?: string | null
          codigo_ano?: number | null
          codigo_operacional?: string | null
          codigo_reserva_hotel?: string | null
          comprovante_reserva_url?: string | null
          confirmacao_origem?: string | null
          confirmado_com?: string | null
          confirmado_em?: string | null
          contato_confirmacao?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_checkin?: string
          data_checkout?: string
          data_checkout_real?: string | null
          estacionamento?: boolean | null
          fluxo_versao?: number
          horario_chegada?: string | null
          hotel_id?: string | null
          id?: string
          inclui_almoco?: boolean | null
          inclui_cafe?: boolean | null
          inclui_janta?: boolean | null
          link_reserva?: string | null
          nome_hotel?: string | null
          observacao_hospedagem?: string | null
          quantidade_diarias?: number
          quantidade_quartos?: number | null
          solicitacao_id?: string
          status_hospedagem?: string | null
          tipo_quarto?: string | null
          uf_hotel?: string | null
          updated_at?: string | null
          valor_diaria?: number
          valor_total_final?: number | null
          valor_total_previsto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_reservas_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_hoteis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reservas_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_canceladas"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_reservas_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_minhas_solicitacoes"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_reservas_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_reservas_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reservas_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["solicitacao_id"]
          },
        ]
      }
      hospedagem_solicitacao_colaboradores: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          colaborador_id: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string | null
          data_checkin_prevista: string | null
          data_checkout_prevista: string | null
          empresa: string | null
          horario_chegada_previsto: string | null
          id: string
          motivo_recusa: string | null
          nome_colaborador: string
          observacoes: string | null
          quantidade_diarias_prevista: number | null
          recusado_em: string | null
          recusado_por: string | null
          reserva_id: string | null
          sexo: string | null
          solicitacao_id: string
          status_colaborador: string | null
          status_item: string
          supervisao: string | null
          tipo_colaborador: string | null
          updated_at: string
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          colaborador_id?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string | null
          data_checkin_prevista?: string | null
          data_checkout_prevista?: string | null
          empresa?: string | null
          horario_chegada_previsto?: string | null
          id?: string
          motivo_recusa?: string | null
          nome_colaborador: string
          observacoes?: string | null
          quantidade_diarias_prevista?: number | null
          recusado_em?: string | null
          recusado_por?: string | null
          reserva_id?: string | null
          sexo?: string | null
          solicitacao_id: string
          status_colaborador?: string | null
          status_item?: string
          supervisao?: string | null
          tipo_colaborador?: string | null
          updated_at?: string
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          colaborador_id?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string | null
          data_checkin_prevista?: string | null
          data_checkout_prevista?: string | null
          empresa?: string | null
          horario_chegada_previsto?: string | null
          id?: string
          motivo_recusa?: string | null
          nome_colaborador?: string
          observacoes?: string | null
          quantidade_diarias_prevista?: number | null
          recusado_em?: string | null
          recusado_por?: string | null
          reserva_id?: string | null
          sexo?: string | null
          solicitacao_id?: string
          status_colaborador?: string | null
          status_item?: string
          supervisao?: string | null
          tipo_colaborador?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hosp_solic_colab_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hosp_solic_colab_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_solicitacao_colaboradores_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_canceladas"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_solicitacao_colaboradores_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_minhas_solicitacoes"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_solicitacao_colaboradores_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["solicitacao_id"]
          },
          {
            foreignKeyName: "hospedagem_solicitacao_colaboradores_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_solicitacao_colaboradores_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_v3_itens"
            referencedColumns: ["solicitacao_id"]
          },
        ]
      }
      hospedagem_solicitacoes: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          checkin: string | null
          checkout: string | null
          cidade: string | null
          cliente: string | null
          codigo: string | null
          colaborador: string | null
          coordenacao: string | null
          created_at: string
          created_by: string | null
          data_checkin_prevista: string | null
          data_checkout_prevista: string | null
          data_solicitacao: string
          empresa: string | null
          endereco_embarque: string | null
          fluxo_versao: number
          horario_chegada_previsto: string | null
          hotel_sugerido: string | null
          id: string
          latitude_embarque: number | null
          link_local_embarque: string | null
          local_embarque: string | null
          longitude_embarque: number | null
          motivo_cancelamento: string | null
          observacao_gestor: string | null
          observacao_interna: string | null
          observacoes: string | null
          origem_solicitacao: string
          preferencia_hospedagem: string | null
          programacao_id: string | null
          quantidade_diarias_prevista: number | null
          regional: string | null
          saldo_informado: number | null
          solicitante_email: string | null
          solicitante_id: string | null
          solicitante_nome: string | null
          status: string
          status_solicitacao: string | null
          supervisao: string | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          checkin?: string | null
          checkout?: string | null
          cidade?: string | null
          cliente?: string | null
          codigo?: string | null
          colaborador?: string | null
          coordenacao?: string | null
          created_at?: string
          created_by?: string | null
          data_checkin_prevista?: string | null
          data_checkout_prevista?: string | null
          data_solicitacao: string
          empresa?: string | null
          endereco_embarque?: string | null
          fluxo_versao?: number
          horario_chegada_previsto?: string | null
          hotel_sugerido?: string | null
          id?: string
          latitude_embarque?: number | null
          link_local_embarque?: string | null
          local_embarque?: string | null
          longitude_embarque?: number | null
          motivo_cancelamento?: string | null
          observacao_gestor?: string | null
          observacao_interna?: string | null
          observacoes?: string | null
          origem_solicitacao?: string
          preferencia_hospedagem?: string | null
          programacao_id?: string | null
          quantidade_diarias_prevista?: number | null
          regional?: string | null
          saldo_informado?: number | null
          solicitante_email?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
          status?: string
          status_solicitacao?: string | null
          supervisao?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          checkin?: string | null
          checkout?: string | null
          cidade?: string | null
          cliente?: string | null
          codigo?: string | null
          colaborador?: string | null
          coordenacao?: string | null
          created_at?: string
          created_by?: string | null
          data_checkin_prevista?: string | null
          data_checkout_prevista?: string | null
          data_solicitacao?: string
          empresa?: string | null
          endereco_embarque?: string | null
          fluxo_versao?: number
          horario_chegada_previsto?: string | null
          hotel_sugerido?: string | null
          id?: string
          latitude_embarque?: number | null
          link_local_embarque?: string | null
          local_embarque?: string | null
          longitude_embarque?: number | null
          motivo_cancelamento?: string | null
          observacao_gestor?: string | null
          observacao_interna?: string | null
          observacoes?: string | null
          origem_solicitacao?: string
          preferencia_hospedagem?: string | null
          programacao_id?: string | null
          quantidade_diarias_prevista?: number | null
          regional?: string | null
          saldo_informado?: number | null
          solicitante_email?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
          status?: string
          status_solicitacao?: string | null
          supervisao?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_solicitacoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_solicitacoes_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_solicitacoes_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes_registros: {
        Row: {
          arquivo_url: string | null
          created_at: string
          detalhe_erros: Json | null
          duplicidades: number
          erros: number
          fonte: string
          id: string
          job_id: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          qtd_atualizada: number
          qtd_inserida: number
          qtd_recebida: number
          responsavel: string | null
        }
        Insert: {
          arquivo_url?: string | null
          created_at?: string
          detalhe_erros?: Json | null
          duplicidades?: number
          erros?: number
          fonte: string
          id?: string
          job_id?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          qtd_atualizada?: number
          qtd_inserida?: number
          qtd_recebida?: number
          responsavel?: string | null
        }
        Update: {
          arquivo_url?: string | null
          created_at?: string
          detalhe_erros?: Json | null
          duplicidades?: number
          erros?: number
          fonte?: string
          id?: string
          job_id?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          qtd_atualizada?: number
          qtd_inserida?: number
          qtd_recebida?: number
          responsavel?: string | null
        }
        Relationships: []
      }
      indisponibilidades: {
        Row: {
          colaborador_cpf: string | null
          colaborador_nome: string
          created_at: string
          created_by: string | null
          data_fim: string
          data_inicio: string
          id: string
          motivo: string
          observacoes: string | null
        }
        Insert: {
          colaborador_cpf?: string | null
          colaborador_nome: string
          created_at?: string
          created_by?: string | null
          data_fim: string
          data_inicio: string
          id?: string
          motivo: string
          observacoes?: string | null
        }
        Update: {
          colaborador_cpf?: string | null
          colaborador_nome?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          id?: string
          motivo?: string
          observacoes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "indisponibilidades_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      logistica_abertura_os: {
        Row: {
          agente_job_id: string | null
          aprovado_em: string | null
          aprovado_por: string | null
          armazem_embarque: string
          cadastrado_em: string | null
          cadastrado_por: string | null
          campos_corrigir: Json
          cidade_destino: string
          cidade_embarque: string
          contratante_cliente: string
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          erro_agente: string | null
          filial_pagadora: string
          id: string
          local_destino: string
          numero_contrato: string
          numero_os_cadastrada: string | null
          observacao_adm: string | null
          pontos_problema: Json
          processamento_finalizado_em: string | null
          processamento_iniciado_em: string | null
          produto: string
          produtor: string | null
          raw: Json
          regional: string
          servico: string | null
          solicitante_id: string | null
          solicitante_nome: string | null
          status: string
          tentativas_agente: number
          testes: Json
          tipo_produto: string
          troca_notas: string
          uf_destino: string | null
          uf_embarque: string | null
          updated_at: string
          volume_inicial: number
        }
        Insert: {
          agente_job_id?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          armazem_embarque: string
          cadastrado_em?: string | null
          cadastrado_por?: string | null
          campos_corrigir?: Json
          cidade_destino: string
          cidade_embarque: string
          contratante_cliente: string
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          erro_agente?: string | null
          filial_pagadora: string
          id?: string
          local_destino: string
          numero_contrato: string
          numero_os_cadastrada?: string | null
          observacao_adm?: string | null
          pontos_problema?: Json
          processamento_finalizado_em?: string | null
          processamento_iniciado_em?: string | null
          produto: string
          produtor?: string | null
          raw?: Json
          regional: string
          servico?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
          status?: string
          tentativas_agente?: number
          testes?: Json
          tipo_produto: string
          troca_notas: string
          uf_destino?: string | null
          uf_embarque?: string | null
          updated_at?: string
          volume_inicial?: number
        }
        Update: {
          agente_job_id?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          armazem_embarque?: string
          cadastrado_em?: string | null
          cadastrado_por?: string | null
          campos_corrigir?: Json
          cidade_destino?: string
          cidade_embarque?: string
          contratante_cliente?: string
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          erro_agente?: string | null
          filial_pagadora?: string
          id?: string
          local_destino?: string
          numero_contrato?: string
          numero_os_cadastrada?: string | null
          observacao_adm?: string | null
          pontos_problema?: Json
          processamento_finalizado_em?: string | null
          processamento_iniciado_em?: string | null
          produto?: string
          produtor?: string | null
          raw?: Json
          regional?: string
          servico?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
          status?: string
          tentativas_agente?: number
          testes?: Json
          tipo_produto?: string
          troca_notas?: string
          uf_destino?: string | null
          uf_embarque?: string | null
          updated_at?: string
          volume_inicial?: number
        }
        Relationships: []
      }
      logistica_ajuste_config: {
        Row: {
          anexo_obrigatorio: boolean
          cliente: string
          created_at: string
          id: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          anexo_obrigatorio?: boolean
          cliente: string
          created_at?: string
          id?: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          anexo_obrigatorio?: boolean
          cliente?: string
          created_at?: string
          id?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      logistica_ajustes_saldo: {
        Row: {
          anexo_url: string | null
          atualizado_por: string | null
          cliente: string | null
          created_at: string
          criado_por: string | null
          data: string
          id: string
          motivo: string | null
          numero_os: string | null
          os_id: string
          responsavel_ajuste: string | null
          saldo_anterior: number | null
          saldo_aprovado: number | null
          saldo_solicitado: number | null
          solicitante: string | null
          status: string
          updated_at: string
        }
        Insert: {
          anexo_url?: string | null
          atualizado_por?: string | null
          cliente?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          motivo?: string | null
          numero_os?: string | null
          os_id: string
          responsavel_ajuste?: string | null
          saldo_anterior?: number | null
          saldo_aprovado?: number | null
          saldo_solicitado?: number | null
          solicitante?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          anexo_url?: string | null
          atualizado_por?: string | null
          cliente?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          motivo?: string | null
          numero_os?: string | null
          os_id?: string
          responsavel_ajuste?: string | null
          saldo_anterior?: number | null
          saldo_aprovado?: number | null
          saldo_solicitado?: number | null
          solicitante?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistica_alertas: {
        Row: {
          atraso_horas: number | null
          classificador: string | null
          cliente: string | null
          coordenacao: string | null
          created_at: string
          criado_por: string | null
          id: string
          local: string | null
          mensagem: string | null
          os: string | null
          os_id: string | null
          payload: Json | null
          resposta: string | null
          status: string
          telefone: string | null
          tipo: string
          ultima_atualizacao: string | null
          updated_at: string
        }
        Insert: {
          atraso_horas?: number | null
          classificador?: string | null
          cliente?: string | null
          coordenacao?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          local?: string | null
          mensagem?: string | null
          os?: string | null
          os_id?: string | null
          payload?: Json | null
          resposta?: string | null
          status?: string
          telefone?: string | null
          tipo?: string
          ultima_atualizacao?: string | null
          updated_at?: string
        }
        Update: {
          atraso_horas?: number | null
          classificador?: string | null
          cliente?: string | null
          coordenacao?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          local?: string | null
          mensagem?: string | null
          os?: string | null
          os_id?: string | null
          payload?: Json | null
          resposta?: string | null
          status?: string
          telefone?: string | null
          tipo?: string
          ultima_atualizacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      logistica_btg_ajustes: {
        Row: {
          created_at: string | null
          id: number
          observacao: string | null
          row_key: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          observacao?: string | null
          row_key: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          observacao?: string | null
          row_key?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      logistica_btg_distribuicao: {
        Row: {
          colaborador: string | null
          contrato: string | null
          financeiro: string | null
          id: number
          lote: number | null
          numero_os: string | null
          prod_dia_os: string | null
          remanescente: number | null
          supervisao: string | null
          updated_at: string | null
        }
        Insert: {
          colaborador?: string | null
          contrato?: string | null
          financeiro?: string | null
          id?: number
          lote?: number | null
          numero_os?: string | null
          prod_dia_os?: string | null
          remanescente?: number | null
          supervisao?: string | null
          updated_at?: string | null
        }
        Update: {
          colaborador?: string | null
          contrato?: string | null
          financeiro?: string | null
          id?: number
          lote?: number | null
          numero_os?: string | null
          prod_dia_os?: string | null
          remanescente?: number | null
          supervisao?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      logistica_btg_lista_os: {
        Row: {
          contrato: string | null
          financeiro: string | null
          id: string
          lote: number | null
          numero_os: string | null
          remanescente: number | null
          situacao: string | null
          supervisao: string | null
          updated_at: string | null
        }
        Insert: {
          contrato?: string | null
          financeiro?: string | null
          id?: string
          lote?: number | null
          numero_os?: string | null
          remanescente?: number | null
          situacao?: string | null
          supervisao?: string | null
          updated_at?: string | null
        }
        Update: {
          contrato?: string | null
          financeiro?: string | null
          id?: string
          lote?: number | null
          numero_os?: string | null
          remanescente?: number | null
          situacao?: string | null
          supervisao?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      logistica_btg_solicitacoes: {
        Row: {
          aba: string | null
          checkin_diario: string | null
          cliente: string | null
          commodity: string | null
          contrato_original: string | null
          contrato_status: string | null
          created_at: string | null
          id: number
          linha: number | null
          numero_os_relatorio: string | null
          quantidade: number | null
          raw: Json | null
          tipo_solicitacao: string | null
          updated_at: string | null
        }
        Insert: {
          aba?: string | null
          checkin_diario?: string | null
          cliente?: string | null
          commodity?: string | null
          contrato_original?: string | null
          contrato_status?: string | null
          created_at?: string | null
          id?: number
          linha?: number | null
          numero_os_relatorio?: string | null
          quantidade?: number | null
          raw?: Json | null
          tipo_solicitacao?: string | null
          updated_at?: string | null
        }
        Update: {
          aba?: string | null
          checkin_diario?: string | null
          cliente?: string | null
          commodity?: string | null
          contrato_original?: string | null
          contrato_status?: string | null
          created_at?: string | null
          id?: number
          linha?: number | null
          numero_os_relatorio?: string | null
          quantidade?: number | null
          raw?: Json | null
          tipo_solicitacao?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      logistica_btg_solicitacoes_staging: {
        Row: {
          aba: string | null
          checkin_diario: string | null
          cliente: string | null
          commodity: string | null
          contrato_original: string | null
          contrato_status: string | null
          created_at: string | null
          id: number
          linha: number | null
          numero_os_relatorio: string | null
          quantidade: number | null
          raw: Json | null
          tipo_solicitacao: string | null
          updated_at: string | null
        }
        Insert: {
          aba?: string | null
          checkin_diario?: string | null
          cliente?: string | null
          commodity?: string | null
          contrato_original?: string | null
          contrato_status?: string | null
          created_at?: string | null
          id?: number
          linha?: number | null
          numero_os_relatorio?: string | null
          quantidade?: number | null
          raw?: Json | null
          tipo_solicitacao?: string | null
          updated_at?: string | null
        }
        Update: {
          aba?: string | null
          checkin_diario?: string | null
          cliente?: string | null
          commodity?: string | null
          contrato_original?: string | null
          contrato_status?: string | null
          created_at?: string | null
          id?: number
          linha?: number | null
          numero_os_relatorio?: string | null
          quantidade?: number | null
          raw?: Json | null
          tipo_solicitacao?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      logistica_cargas_irregularidades: {
        Row: {
          chave_unica: string
          cliente: string | null
          colaborador: string | null
          coordenacao: string | null
          created_at: string
          data_classificacao: string
          detectado_em: string
          distancia_m: number | null
          hora_cadastro: string | null
          id: string
          lat_lancamento: number
          lat_os: number | null
          laudo: string | null
          lng_lancamento: number
          lng_os: number | null
          nota_fiscal: string | null
          observacao: string | null
          origem: string
          os: string
          placa: string | null
          produto: string | null
          raio_m: number
          raw: Json
          resolvido_em: string | null
          status: string
          supervisao: string | null
          tons: number | null
          ultima_verificacao_em: string
          updated_at: string
        }
        Insert: {
          chave_unica: string
          cliente?: string | null
          colaborador?: string | null
          coordenacao?: string | null
          created_at?: string
          data_classificacao: string
          detectado_em?: string
          distancia_m?: number | null
          hora_cadastro?: string | null
          id?: string
          lat_lancamento: number
          lat_os?: number | null
          laudo?: string | null
          lng_lancamento: number
          lng_os?: number | null
          nota_fiscal?: string | null
          observacao?: string | null
          origem?: string
          os: string
          placa?: string | null
          produto?: string | null
          raio_m?: number
          raw?: Json
          resolvido_em?: string | null
          status?: string
          supervisao?: string | null
          tons?: number | null
          ultima_verificacao_em?: string
          updated_at?: string
        }
        Update: {
          chave_unica?: string
          cliente?: string | null
          colaborador?: string | null
          coordenacao?: string | null
          created_at?: string
          data_classificacao?: string
          detectado_em?: string
          distancia_m?: number | null
          hora_cadastro?: string | null
          id?: string
          lat_lancamento?: number
          lat_os?: number | null
          laudo?: string | null
          lng_lancamento?: number
          lng_os?: number | null
          nota_fiscal?: string | null
          observacao?: string | null
          origem?: string
          os?: string
          placa?: string | null
          produto?: string | null
          raio_m?: number
          raw?: Json
          resolvido_em?: string | null
          status?: string
          supervisao?: string | null
          tons?: number | null
          ultima_verificacao_em?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistica_cargas_monitor_execucoes: {
        Row: {
          data_ref: string
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          raw: Json
          status: string
          total_com_coordenada: number
          total_irregularidades: number
          total_linhas: number
          total_sem_referencia_os: number
        }
        Insert: {
          data_ref: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          raw?: Json
          status?: string
          total_com_coordenada?: number
          total_irregularidades?: number
          total_linhas?: number
          total_sem_referencia_os?: number
        }
        Update: {
          data_ref?: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          raw?: Json
          status?: string
          total_com_coordenada?: number
          total_irregularidades?: number
          total_linhas?: number
          total_sem_referencia_os?: number
        }
        Relationships: []
      }
      logistica_classificadores_monitor: {
        Row: {
          atraso_horas: number | null
          classificador: string | null
          created_at: string
          escalonado: boolean
          escalonado_para: string | null
          id: string
          notificacao_enviada_em: string | null
          numero_os: string | null
          os_id: string
          resposta: string | null
          resposta_em: string | null
          situacao: string
          ultima_atualizacao: string | null
          updated_at: string
        }
        Insert: {
          atraso_horas?: number | null
          classificador?: string | null
          created_at?: string
          escalonado?: boolean
          escalonado_para?: string | null
          id?: string
          notificacao_enviada_em?: string | null
          numero_os?: string | null
          os_id: string
          resposta?: string | null
          resposta_em?: string | null
          situacao?: string
          ultima_atualizacao?: string | null
          updated_at?: string
        }
        Update: {
          atraso_horas?: number | null
          classificador?: string | null
          created_at?: string
          escalonado?: boolean
          escalonado_para?: string | null
          id?: string
          notificacao_enviada_em?: string | null
          numero_os?: string | null
          os_id?: string
          resposta?: string | null
          resposta_em?: string | null
          situacao?: string
          ultima_atualizacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      logistica_clientes_anexo_regras: {
        Row: {
          aliases: string[]
          cliente: string
          created_at: string
          excecao_origem_igual_cliente: boolean
          id: string
          observacao: string | null
          precisa_anexo: boolean
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          cliente: string
          created_at?: string
          excecao_origem_igual_cliente?: boolean
          id?: string
          observacao?: string | null
          precisa_anexo?: boolean
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          cliente?: string
          created_at?: string
          excecao_origem_igual_cliente?: boolean
          id?: string
          observacao?: string | null
          precisa_anexo?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      logistica_clientes_contrato_regras: {
        Row: {
          aliases: string[]
          cliente: string
          created_at: string
          exemplo_formato: string | null
          id: string
          observacao: string | null
          regex_formato: string | null
          rotulo_campo: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          cliente: string
          created_at?: string
          exemplo_formato?: string | null
          id?: string
          observacao?: string | null
          regex_formato?: string | null
          rotulo_campo?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          cliente?: string
          created_at?: string
          exemplo_formato?: string | null
          id?: string
          observacao?: string | null
          regex_formato?: string | null
          rotulo_campo?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistica_clientes_filiais_pagadoras: {
        Row: {
          ativo: boolean
          cliente_nacional: string
          created_at: string
          filial_pagadora: string
          id: string
          origem: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cliente_nacional: string
          created_at?: string
          filial_pagadora: string
          id?: string
          origem?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cliente_nacional?: string
          created_at?: string
          filial_pagadora?: string
          id?: string
          origem?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistica_clientes_nacionais_aliases: {
        Row: {
          alias_normalizado: string
          canonical: string
          criado_em: string
        }
        Insert: {
          alias_normalizado: string
          canonical: string
          criado_em?: string
        }
        Update: {
          alias_normalizado?: string
          canonical?: string
          criado_em?: string
        }
        Relationships: []
      }
      logistica_conferencias: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string
          atualizado_por: string | null
          created_at: string
          criado_por: string | null
          data_conferencia: string | null
          data_envio: string
          id: string
          numero_os: string | null
          observacao: string | null
          os_id: string
          responsavel: string | null
          status: string
          updated_at: string
          usuario: string
          versao: number
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url: string
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_conferencia?: string | null
          data_envio?: string
          id?: string
          numero_os?: string | null
          observacao?: string | null
          os_id: string
          responsavel?: string | null
          status?: string
          updated_at?: string
          usuario: string
          versao?: number
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_conferencia?: string | null
          data_envio?: string
          id?: string
          numero_os?: string | null
          observacao?: string | null
          os_id?: string
          responsavel?: string | null
          status?: string
          updated_at?: string
          usuario?: string
          versao?: number
        }
        Relationships: []
      }
      logistica_exportacoes_historico: {
        Row: {
          arquivo_url: string | null
          created_at: string
          destinatarios: string[] | null
          enviado_em: string | null
          enviado_email: boolean
          gerado_por: string | null
          id: string
          parametros: Json | null
          tipo: string
          versao: number
        }
        Insert: {
          arquivo_url?: string | null
          created_at?: string
          destinatarios?: string[] | null
          enviado_em?: string | null
          enviado_email?: boolean
          gerado_por?: string | null
          id?: string
          parametros?: Json | null
          tipo: string
          versao?: number
        }
        Update: {
          arquivo_url?: string | null
          created_at?: string
          destinatarios?: string[] | null
          enviado_em?: string | null
          enviado_email?: boolean
          gerado_por?: string | null
          id?: string
          parametros?: Json | null
          tipo?: string
          versao?: number
        }
        Relationships: []
      }
      logistica_fob: {
        Row: {
          arquivo_movimentacao: string | null
          arquivo_nhe: string | null
          arquivo_producao: string | null
          cidade: string | null
          cliente: string | null
          criado_em: string
          criado_por: string | null
          data_referencia: string
          funcionario: string | null
          id: string
          import_hash: string | null
          local_embarque: string | null
          motivo: string | null
          numero_os: string | null
          observacao: string | null
          observacao_gestor: string | null
          origem: string
          raw: Json
          status: string
          status_comparacao: string
          supervisao: string | null
          tons_movimento: number
          tons_nh: number
          tons_producao: number
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          visualizado: boolean
        }
        Insert: {
          arquivo_movimentacao?: string | null
          arquivo_nhe?: string | null
          arquivo_producao?: string | null
          cidade?: string | null
          cliente?: string | null
          criado_em?: string
          criado_por?: string | null
          data_referencia: string
          funcionario?: string | null
          id?: string
          import_hash?: string | null
          local_embarque?: string | null
          motivo?: string | null
          numero_os?: string | null
          observacao?: string | null
          observacao_gestor?: string | null
          origem?: string
          raw?: Json
          status?: string
          status_comparacao?: string
          supervisao?: string | null
          tons_movimento?: number
          tons_nh?: number
          tons_producao?: number
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          visualizado?: boolean
        }
        Update: {
          arquivo_movimentacao?: string | null
          arquivo_nhe?: string | null
          arquivo_producao?: string | null
          cidade?: string | null
          cliente?: string | null
          criado_em?: string
          criado_por?: string | null
          data_referencia?: string
          funcionario?: string | null
          id?: string
          import_hash?: string | null
          local_embarque?: string | null
          motivo?: string | null
          numero_os?: string | null
          observacao?: string | null
          observacao_gestor?: string | null
          origem?: string
          raw?: Json
          status?: string
          status_comparacao?: string
          supervisao?: string | null
          tons_movimento?: number
          tons_nh?: number
          tons_producao?: number
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          visualizado?: boolean
        }
        Relationships: []
      }
      logistica_informativos_geracoes: {
        Row: {
          arquivo_url: string | null
          created_at: string
          gerado_por: string | null
          id: string
          minimo_cargas: number | null
          origem: string
          parametros: Json | null
          periodo_fim: string | null
          periodo_inicio: string | null
          tipo: string
        }
        Insert: {
          arquivo_url?: string | null
          created_at?: string
          gerado_por?: string | null
          id?: string
          minimo_cargas?: number | null
          origem?: string
          parametros?: Json | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          tipo: string
        }
        Update: {
          arquivo_url?: string | null
          created_at?: string
          gerado_por?: string | null
          id?: string
          minimo_cargas?: number | null
          origem?: string
          parametros?: Json | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          tipo?: string
        }
        Relationships: []
      }
      logistica_locais_embarque_novos: {
        Row: {
          cidade: string
          created_at: string
          id: string
          latitude: number
          longitude: number
          nome_local: string
          observacao: string | null
          solicitante_id: string | null
          solicitante_nome: string | null
          spl_code: number | null
          status: string
          uf: string
          updated_at: string
        }
        Insert: {
          cidade: string
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          nome_local: string
          observacao?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
          spl_code?: number | null
          status?: string
          uf: string
          updated_at?: string
        }
        Update: {
          cidade?: string
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          nome_local?: string
          observacao?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
          spl_code?: number | null
          status?: string
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistica_nhe_lancamentos_auto: {
        Row: {
          chave_unica: string
          cliente: string | null
          colaborador_chave: string | null
          coordenacao: string | null
          criado_em: string
          data_referencia: string
          distancia_m: number | null
          erro: string | null
          funcionario: string | null
          id: string
          lancado_em: string | null
          motivo: string | null
          numero_os: string
          observacao: string | null
          raio_m: number | null
          raw: Json | null
          status: string
          supervisao: string | null
          tentativas: number
          updated_at: string
        }
        Insert: {
          chave_unica: string
          cliente?: string | null
          colaborador_chave?: string | null
          coordenacao?: string | null
          criado_em?: string
          data_referencia: string
          distancia_m?: number | null
          erro?: string | null
          funcionario?: string | null
          id?: string
          lancado_em?: string | null
          motivo?: string | null
          numero_os: string
          observacao?: string | null
          raio_m?: number | null
          raw?: Json | null
          status?: string
          supervisao?: string | null
          tentativas?: number
          updated_at?: string
        }
        Update: {
          chave_unica?: string
          cliente?: string | null
          colaborador_chave?: string | null
          coordenacao?: string | null
          criado_em?: string
          data_referencia?: string
          distancia_m?: number | null
          erro?: string | null
          funcionario?: string | null
          id?: string
          lancado_em?: string | null
          motivo?: string | null
          numero_os?: string
          observacao?: string | null
          raio_m?: number | null
          raw?: Json | null
          status?: string
          supervisao?: string | null
          tentativas?: number
          updated_at?: string
        }
        Relationships: []
      }
      logistica_nhe_lancamentos_execucoes: {
        Row: {
          data_referencia: string | null
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          raw: Json | null
          status: string
          total_candidatos: number | null
          total_erro: number | null
          total_fora_do_raio: number | null
          total_pendentes: number | null
          total_sem_coordenada_os: number | null
          total_sem_login: number | null
          total_sucesso: number | null
        }
        Insert: {
          data_referencia?: string | null
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          raw?: Json | null
          status?: string
          total_candidatos?: number | null
          total_erro?: number | null
          total_fora_do_raio?: number | null
          total_pendentes?: number | null
          total_sem_coordenada_os?: number | null
          total_sem_login?: number | null
          total_sucesso?: number | null
        }
        Update: {
          data_referencia?: string | null
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          raw?: Json | null
          status?: string
          total_candidatos?: number | null
          total_erro?: number | null
          total_fora_do_raio?: number | null
          total_pendentes?: number | null
          total_sem_coordenada_os?: number | null
          total_sem_login?: number | null
          total_sucesso?: number | null
        }
        Relationships: []
      }
      logistica_ocr_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          document_type: string
          document_url: string
          error: string | null
          expires_at: string
          file_type: string
          id: number
          instruction: string | null
          locked_at: string | null
          numero_os: string | null
          os_id: string | null
          page_current: number | null
          page_total: number | null
          priority: number
          progress: number
          raw_ocr: Json | null
          raw_text: string | null
          request_user_id: string
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          document_type?: string
          document_url: string
          error?: string | null
          expires_at?: string
          file_type: string
          id?: number
          instruction?: string | null
          locked_at?: string | null
          numero_os?: string | null
          os_id?: string | null
          page_current?: number | null
          page_total?: number | null
          priority?: number
          progress?: number
          raw_ocr?: Json | null
          raw_text?: string | null
          request_user_id: string
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          document_type?: string
          document_url?: string
          error?: string | null
          expires_at?: string
          file_type?: string
          id?: number
          instruction?: string | null
          locked_at?: string | null
          numero_os?: string | null
          os_id?: string | null
          page_current?: number | null
          page_total?: number | null
          priority?: number
          progress?: number
          raw_ocr?: Json | null
          raw_text?: string | null
          request_user_id?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: []
      }
      logistica_ocr_workers: {
        Row: {
          created_at: string
          current_job_id: number | null
          details: Json
          hostname: string | null
          last_seen: string
          status: string
          updated_at: string
          version: string | null
          worker_id: string
        }
        Insert: {
          created_at?: string
          current_job_id?: number | null
          details?: Json
          hostname?: string | null
          last_seen?: string
          status?: string
          updated_at?: string
          version?: string | null
          worker_id: string
        }
        Update: {
          created_at?: string
          current_job_id?: number | null
          details?: Json
          hostname?: string | null
          last_seen?: string
          status?: string
          updated_at?: string
          version?: string | null
          worker_id?: string
        }
        Relationships: []
      }
      logistica_pre_conferencia_os: {
        Row: {
          atualizado_por: string | null
          cargas_ocr: Json
          cargas_sistema: Json
          confirmado_em: string | null
          confirmado_por: string | null
          created_at: string
          criado_por: string | null
          id: number
          laudo_urls: Json
          numero_os: string
          os_id: string
          resultado: Json
          status: string
          updated_at: string
        }
        Insert: {
          atualizado_por?: string | null
          cargas_ocr?: Json
          cargas_sistema?: Json
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string
          criado_por?: string | null
          id?: number
          laudo_urls?: Json
          numero_os: string
          os_id: string
          resultado?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          atualizado_por?: string | null
          cargas_ocr?: Json
          cargas_sistema?: Json
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string
          criado_por?: string | null
          id?: number
          laudo_urls?: Json
          numero_os?: string
          os_id?: string
          resultado?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistica_relatorios_destinatarios: {
        Row: {
          ativo: boolean
          atualizado_por: string | null
          cliente: string
          created_at: string
          email: string
          grupo: string | null
          id: string
          nome: string | null
          origem: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          atualizado_por?: string | null
          cliente?: string
          created_at?: string
          email: string
          grupo?: string | null
          id?: string
          nome?: string | null
          origem?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          atualizado_por?: string | null
          cliente?: string
          created_at?: string
          email?: string
          grupo?: string | null
          id?: string
          nome?: string | null
          origem?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistica_relatorios_envios: {
        Row: {
          arquivo_nome: string | null
          assunto: string | null
          cliente: string
          created_at: string
          data_final: string | null
          data_inicial: string | null
          destinatarios: string[]
          destinatarios_cc: string[]
          enviado_em: string | null
          enviado_por: string | null
          erro: string | null
          formato: string
          id: string
          mensagem: string | null
          payload: Json
          status: string
          total_cargas: number
          total_embarcado: number
          total_linhas: number
          total_toneladas: number
          updated_at: string
        }
        Insert: {
          arquivo_nome?: string | null
          assunto?: string | null
          cliente: string
          created_at?: string
          data_final?: string | null
          data_inicial?: string | null
          destinatarios?: string[]
          destinatarios_cc?: string[]
          enviado_em?: string | null
          enviado_por?: string | null
          erro?: string | null
          formato?: string
          id?: string
          mensagem?: string | null
          payload?: Json
          status?: string
          total_cargas?: number
          total_embarcado?: number
          total_linhas?: number
          total_toneladas?: number
          updated_at?: string
        }
        Update: {
          arquivo_nome?: string | null
          assunto?: string | null
          cliente?: string
          created_at?: string
          data_final?: string | null
          data_inicial?: string | null
          destinatarios?: string[]
          destinatarios_cc?: string[]
          enviado_em?: string | null
          enviado_por?: string | null
          erro?: string | null
          formato?: string
          id?: string
          mensagem?: string | null
          payload?: Json
          status?: string
          total_cargas?: number
          total_embarcado?: number
          total_linhas?: number
          total_toneladas?: number
          updated_at?: string
        }
        Relationships: []
      }
      logistica_solicitacoes: {
        Row: {
          colaborador: string | null
          created_at: string
          created_by: string | null
          data_solicitacao: string
          destino: string | null
          id: string
          observacoes: string | null
          origem: string | null
          status: string
          tipo_deslocamento: string | null
        }
        Insert: {
          colaborador?: string | null
          created_at?: string
          created_by?: string | null
          data_solicitacao: string
          destino?: string | null
          id?: string
          observacoes?: string | null
          origem?: string | null
          status?: string
          tipo_deslocamento?: string | null
        }
        Update: {
          colaborador?: string | null
          created_at?: string
          created_by?: string | null
          data_solicitacao?: string
          destino?: string | null
          id?: string
          observacoes?: string | null
          origem?: string | null
          status?: string
          tipo_deslocamento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logistica_solicitacoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mapa_embarque_alertas_atualizacao: {
        Row: {
          agendado_para: string | null
          alertado_em: string | null
          cliente: string | null
          colaborador_cpf: string | null
          colaborador_nome: string
          created_at: string
          data_mapa: string
          external_message_id: string | null
          id: string
          informativo_em: string
          os: string
          respondido_em: string | null
          resposta: string | null
          silenciado_data: string | null
          silenciado_em: string | null
          status: string
          telefone: string | null
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          agendado_para?: string | null
          alertado_em?: string | null
          cliente?: string | null
          colaborador_cpf?: string | null
          colaborador_nome: string
          created_at?: string
          data_mapa: string
          external_message_id?: string | null
          id?: string
          informativo_em: string
          os: string
          respondido_em?: string | null
          resposta?: string | null
          silenciado_data?: string | null
          silenciado_em?: string | null
          status?: string
          telefone?: string | null
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          agendado_para?: string | null
          alertado_em?: string | null
          cliente?: string | null
          colaborador_cpf?: string | null
          colaborador_nome?: string
          created_at?: string
          data_mapa?: string
          external_message_id?: string | null
          id?: string
          informativo_em?: string
          os?: string
          respondido_em?: string | null
          resposta?: string | null
          silenciado_data?: string | null
          silenciado_em?: string | null
          status?: string
          telefone?: string | null
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      metas_auditoria: {
        Row: {
          ano: number
          apto: boolean
          created_at: string
          id: number
          mes: number
          nome_arquivo: string | null
          percentual_limite: number
          regional: string
          total_embarcado: number
          updated_at: string
          valor_auditoria: number
        }
        Insert: {
          ano: number
          apto?: boolean
          created_at?: string
          id?: number
          mes: number
          nome_arquivo?: string | null
          percentual_limite: number
          regional: string
          total_embarcado?: number
          updated_at?: string
          valor_auditoria?: number
        }
        Update: {
          ano?: number
          apto?: boolean
          created_at?: string
          id?: number
          mes?: number
          nome_arquivo?: string | null
          percentual_limite?: number
          regional?: string
          total_embarcado?: number
          updated_at?: string
          valor_auditoria?: number
        }
        Relationships: []
      }
      metas_custo_regional: {
        Row: {
          ano: number
          coordenacao: string
          despesa: number | null
          id: number
          mes: number
          updated_at: string
        }
        Insert: {
          ano: number
          coordenacao: string
          despesa?: number | null
          id?: number
          mes: number
          updated_at?: string
        }
        Update: {
          ano?: number
          coordenacao?: string
          despesa?: number | null
          id?: number
          mes?: number
          updated_at?: string
        }
        Relationships: []
      }
      metas_gestores: {
        Row: {
          ativo: boolean
          coordenacao: string
          created_at: string
          gestor: string
          grat40: number | null
          id: number
          salario: number | null
          supervisao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          coordenacao: string
          created_at?: string
          gestor: string
          grat40?: number | null
          id?: number
          salario?: number | null
          supervisao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          coordenacao?: string
          created_at?: string
          gestor?: string
          grat40?: number | null
          id?: number
          salario?: number | null
          supervisao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      metas_producao: {
        Row: {
          ano: number
          ativo: boolean
          bonus_custo: number | null
          bonus_leitura: number | null
          bonus_percentual_minimo: number | null
          bonus_producao: number | null
          bonus_total: number | null
          created_at: string
          estado: string
          fechado: boolean
          fechado_em: string | null
          gestor: string | null
          id: string
          mes: number
          meta_tons: number
          percentual_fechamento: number | null
          produzido_fechamento: number | null
          qualifica_bonus: boolean | null
          regional: string
          salario: number | null
          status_fechamento: string | null
          updated_at: string
        }
        Insert: {
          ano: number
          ativo?: boolean
          bonus_custo?: number | null
          bonus_leitura?: number | null
          bonus_percentual_minimo?: number | null
          bonus_producao?: number | null
          bonus_total?: number | null
          created_at?: string
          estado: string
          fechado?: boolean
          fechado_em?: string | null
          gestor?: string | null
          id?: string
          mes: number
          meta_tons?: number
          percentual_fechamento?: number | null
          produzido_fechamento?: number | null
          qualifica_bonus?: boolean | null
          regional: string
          salario?: number | null
          status_fechamento?: string | null
          updated_at?: string
        }
        Update: {
          ano?: number
          ativo?: boolean
          bonus_custo?: number | null
          bonus_leitura?: number | null
          bonus_percentual_minimo?: number | null
          bonus_producao?: number | null
          bonus_total?: number | null
          created_at?: string
          estado?: string
          fechado?: boolean
          fechado_em?: string | null
          gestor?: string | null
          id?: string
          mes?: number
          meta_tons?: number
          percentual_fechamento?: number | null
          produzido_fechamento?: number | null
          qualifica_bonus?: boolean | null
          regional?: string
          salario?: number | null
          status_fechamento?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      modules: {
        Row: {
          active: boolean
          area: string | null
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          area?: string | null
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          area?: string | null
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      nf_categorizacao_correcoes: {
        Row: {
          categoria_corrigida: string
          categoria_sugerida: string | null
          corrigido_por: string
          created_at: string
          id: string
          nf_id: string
          origem_sugestao: string | null
        }
        Insert: {
          categoria_corrigida: string
          categoria_sugerida?: string | null
          corrigido_por: string
          created_at?: string
          id?: string
          nf_id: string
          origem_sugestao?: string | null
        }
        Update: {
          categoria_corrigida?: string
          categoria_sugerida?: string | null
          corrigido_por?: string
          created_at?: string
          id?: string
          nf_id?: string
          origem_sugestao?: string | null
        }
        Relationships: []
      }
      nf_ocr_fila: {
        Row: {
          arquivo_original_url: string | null
          arquivo_processado_url: string | null
          campos_extraidos: Json | null
          confianca: number | null
          created_at: string
          erro: string | null
          id: string
          nf_id: string | null
          responsavel_revisao: string | null
          status: string
          updated_at: string
          versao_ocr: string | null
        }
        Insert: {
          arquivo_original_url?: string | null
          arquivo_processado_url?: string | null
          campos_extraidos?: Json | null
          confianca?: number | null
          created_at?: string
          erro?: string | null
          id?: string
          nf_id?: string | null
          responsavel_revisao?: string | null
          status?: string
          updated_at?: string
          versao_ocr?: string | null
        }
        Update: {
          arquivo_original_url?: string | null
          arquivo_processado_url?: string | null
          campos_extraidos?: Json | null
          confianca?: number | null
          created_at?: string
          erro?: string | null
          id?: string
          nf_id?: string | null
          responsavel_revisao?: string | null
          status?: string
          updated_at?: string
          versao_ocr?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          mensagem: string | null
          modulo_destino: string
          read_at: string | null
          referencia_id: string | null
          referencia_tipo: string | null
          setor_destino: string | null
          status: string
          titulo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mensagem?: string | null
          modulo_destino: string
          read_at?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          setor_destino?: string | null
          status?: string
          titulo: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mensagem?: string | null
          modulo_destino?: string
          read_at?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          setor_destino?: string | null
          status?: string
          titulo?: string
          user_id?: string | null
        }
        Relationships: []
      }
      operacional_auditoria_colaborador: {
        Row: {
          ativo: boolean
          auditor: string | null
          cidade_destino: string | null
          cidade_embarque: string | null
          cliente_final: string | null
          cliente_nacional: string | null
          cliente_regional: string | null
          colaborador_id: string | null
          contrato: string | null
          coordenacao: string | null
          created_at: string
          data_classificacao: string | null
          data_evento: string | null
          desconto_kg: number | null
          descricao: string | null
          destino: string | null
          diferenca: number | null
          estado_embarque: string | null
          id: string
          import_hash: string
          local_embarque: string | null
          motivo_recusa: string | null
          nf: string | null
          nome_chave: string | null
          nome_colaborador: string
          origem: string | null
          os: string | null
          peso_kg: number | null
          placa: string | null
          produto: string | null
          referencia: string | null
          resultado: string | null
          resultado_auditoria: string | null
          resultado_origem: string | null
          resultado_recusa: string | null
          score_impacto: number | null
          servico: string | null
          severidade: string | null
          supervisao: string | null
          tipo_evento: string | null
          tipo_funcionario: string | null
          uf_destino: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          auditor?: string | null
          cidade_destino?: string | null
          cidade_embarque?: string | null
          cliente_final?: string | null
          cliente_nacional?: string | null
          cliente_regional?: string | null
          colaborador_id?: string | null
          contrato?: string | null
          coordenacao?: string | null
          created_at?: string
          data_classificacao?: string | null
          data_evento?: string | null
          desconto_kg?: number | null
          descricao?: string | null
          destino?: string | null
          diferenca?: number | null
          estado_embarque?: string | null
          id?: string
          import_hash: string
          local_embarque?: string | null
          motivo_recusa?: string | null
          nf?: string | null
          nome_chave?: string | null
          nome_colaborador: string
          origem?: string | null
          os?: string | null
          peso_kg?: number | null
          placa?: string | null
          produto?: string | null
          referencia?: string | null
          resultado?: string | null
          resultado_auditoria?: string | null
          resultado_origem?: string | null
          resultado_recusa?: string | null
          score_impacto?: number | null
          servico?: string | null
          severidade?: string | null
          supervisao?: string | null
          tipo_evento?: string | null
          tipo_funcionario?: string | null
          uf_destino?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          auditor?: string | null
          cidade_destino?: string | null
          cidade_embarque?: string | null
          cliente_final?: string | null
          cliente_nacional?: string | null
          cliente_regional?: string | null
          colaborador_id?: string | null
          contrato?: string | null
          coordenacao?: string | null
          created_at?: string
          data_classificacao?: string | null
          data_evento?: string | null
          desconto_kg?: number | null
          descricao?: string | null
          destino?: string | null
          diferenca?: number | null
          estado_embarque?: string | null
          id?: string
          import_hash?: string
          local_embarque?: string | null
          motivo_recusa?: string | null
          nf?: string | null
          nome_chave?: string | null
          nome_colaborador?: string
          origem?: string | null
          os?: string | null
          peso_kg?: number | null
          placa?: string | null
          produto?: string | null
          referencia?: string | null
          resultado?: string | null
          resultado_auditoria?: string | null
          resultado_origem?: string | null
          resultado_recusa?: string | null
          score_impacto?: number | null
          servico?: string | null
          severidade?: string | null
          supervisao?: string | null
          tipo_evento?: string | null
          tipo_funcionario?: string | null
          uf_destino?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      operacional_colaborador_base: {
        Row: {
          ativo: boolean
          bairro: string | null
          bfleet_lugar_hash: string | null
          bfleet_lugar_id: string | null
          bfleet_lugar_nome: string | null
          bfleet_lugar_payload: Json | null
          bfleet_lugar_sync_em: string | null
          bfleet_lugar_sync_error: string | null
          bfleet_lugar_sync_status: string | null
          cidade_base: string | null
          colaborador_id: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string
          email: string | null
          empresa: string | null
          endereco_base: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          nome_chave: string | null
          origem: string
          pais: string | null
          rua: string | null
          supervisao: string | null
          telefone: string | null
          tipo_mao_obra: string | null
          uf_base: string | null
          updated_at: string
          valor_alimentacao: number | null
          valor_diaria: number | null
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          bfleet_lugar_hash?: string | null
          bfleet_lugar_id?: string | null
          bfleet_lugar_nome?: string | null
          bfleet_lugar_payload?: Json | null
          bfleet_lugar_sync_em?: string | null
          bfleet_lugar_sync_error?: string | null
          bfleet_lugar_sync_status?: string | null
          cidade_base?: string | null
          colaborador_id?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          empresa?: string | null
          endereco_base?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          nome_chave?: string | null
          origem?: string
          pais?: string | null
          rua?: string | null
          supervisao?: string | null
          telefone?: string | null
          tipo_mao_obra?: string | null
          uf_base?: string | null
          updated_at?: string
          valor_alimentacao?: number | null
          valor_diaria?: number | null
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          bfleet_lugar_hash?: string | null
          bfleet_lugar_id?: string | null
          bfleet_lugar_nome?: string | null
          bfleet_lugar_payload?: Json | null
          bfleet_lugar_sync_em?: string | null
          bfleet_lugar_sync_error?: string | null
          bfleet_lugar_sync_status?: string | null
          cidade_base?: string | null
          colaborador_id?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          empresa?: string | null
          endereco_base?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          nome_chave?: string | null
          origem?: string
          pais?: string | null
          rua?: string | null
          supervisao?: string | null
          telefone?: string | null
          tipo_mao_obra?: string | null
          uf_base?: string | null
          updated_at?: string
          valor_alimentacao?: number | null
          valor_diaria?: number | null
        }
        Relationships: []
      }
      operacional_colaboradores_base: {
        Row: {
          ativo: boolean | null
          cidade: string | null
          colaborador_id: string | null
          created_at: string | null
          endereco: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          regional: string | null
          tipo: string
          uf: string | null
          valor_diaria: number | null
        }
        Insert: {
          ativo?: boolean | null
          cidade?: string | null
          colaborador_id?: string | null
          created_at?: string | null
          endereco?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          regional?: string | null
          tipo: string
          uf?: string | null
          valor_diaria?: number | null
        }
        Update: {
          ativo?: boolean | null
          cidade?: string | null
          colaborador_id?: string | null
          created_at?: string | null
          endereco?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          regional?: string | null
          tipo?: string
          uf?: string | null
          valor_diaria?: number | null
        }
        Relationships: []
      }
      operacional_embarques: {
        Row: {
          cidade: string
          cliente: string | null
          created_at: string
          data_embarque: string
          id: string
          latitude: number | null
          local_embarque: string | null
          longitude: number | null
          observacoes: string | null
          qtd_colaboradores: number | null
          status: string
          uf: string
          updated_at: string
          volume_ton: number | null
        }
        Insert: {
          cidade: string
          cliente?: string | null
          created_at?: string
          data_embarque: string
          id?: string
          latitude?: number | null
          local_embarque?: string | null
          longitude?: number | null
          observacoes?: string | null
          qtd_colaboradores?: number | null
          status?: string
          uf: string
          updated_at?: string
          volume_ton?: number | null
        }
        Update: {
          cidade?: string
          cliente?: string | null
          created_at?: string
          data_embarque?: string
          id?: string
          latitude?: number | null
          local_embarque?: string | null
          longitude?: number | null
          observacoes?: string | null
          qtd_colaboradores?: number | null
          status?: string
          uf?: string
          updated_at?: string
          volume_ton?: number | null
        }
        Relationships: []
      }
      operacional_hoteis: {
        Row: {
          ativo: boolean
          cidade: string
          created_at: string
          diaria_duplo: number | null
          diaria_individual: number | null
          diaria_quadruplo: number | null
          diaria_triplo: number | null
          endereco: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          uf: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade: string
          created_at?: string
          diaria_duplo?: number | null
          diaria_individual?: number | null
          diaria_quadruplo?: number | null
          diaria_triplo?: number | null
          endereco?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          uf: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string
          created_at?: string
          diaria_duplo?: number | null
          diaria_individual?: number | null
          diaria_quadruplo?: number | null
          diaria_triplo?: number | null
          endereco?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      operacional_laudos: {
        Row: {
          arquivos_urls: string[]
          avaliado: boolean
          cliente: string | null
          colaborador_key: string | null
          colaborador_latitude: number | null
          colaborador_longitude: number | null
          colaborador_nome: string | null
          coordenacao: string | null
          distancia_casa_km: number | null
          distancia_os_km: number | null
          enviado_em: string
          enviado_por: string | null
          enviado_por_nome: string | null
          geo_capturada: boolean
          geo_latitude: number | null
          geo_longitude: number | null
          geo_precisao_m: number | null
          id: string
          numero_os: string | null
          observacao_revisao: string | null
          origem: string
          os_id: string
          os_latitude: number | null
          os_longitude: number | null
          revisado_em: string | null
          revisado_por: string | null
          revisado_por_nome: string | null
          supervisao: string | null
          suspeito: boolean
        }
        Insert: {
          arquivos_urls?: string[]
          avaliado?: boolean
          cliente?: string | null
          colaborador_key?: string | null
          colaborador_latitude?: number | null
          colaborador_longitude?: number | null
          colaborador_nome?: string | null
          coordenacao?: string | null
          distancia_casa_km?: number | null
          distancia_os_km?: number | null
          enviado_em?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          geo_capturada?: boolean
          geo_latitude?: number | null
          geo_longitude?: number | null
          geo_precisao_m?: number | null
          id?: string
          numero_os?: string | null
          observacao_revisao?: string | null
          origem?: string
          os_id: string
          os_latitude?: number | null
          os_longitude?: number | null
          revisado_em?: string | null
          revisado_por?: string | null
          revisado_por_nome?: string | null
          supervisao?: string | null
          suspeito?: boolean
        }
        Update: {
          arquivos_urls?: string[]
          avaliado?: boolean
          cliente?: string | null
          colaborador_key?: string | null
          colaborador_latitude?: number | null
          colaborador_longitude?: number | null
          colaborador_nome?: string | null
          coordenacao?: string | null
          distancia_casa_km?: number | null
          distancia_os_km?: number | null
          enviado_em?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          geo_capturada?: boolean
          geo_latitude?: number | null
          geo_longitude?: number | null
          geo_precisao_m?: number | null
          id?: string
          numero_os?: string | null
          observacao_revisao?: string | null
          origem?: string
          os_id?: string
          os_latitude?: number | null
          os_longitude?: number | null
          revisado_em?: string | null
          revisado_por?: string | null
          revisado_por_nome?: string | null
          supervisao?: string | null
          suspeito?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "operacional_laudos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "operacional_os"
            referencedColumns: ["id"]
          },
        ]
      }
      operacional_mapa_rotas: {
        Row: {
          colaborador_cpf: string | null
          colaborador_nome: string | null
          created_at: string
          data_referencia: string
          duracao_estimada_min: number
          geometria: Json | null
          gerado_em: string
          gerado_por: string | null
          id: string
          km_total_estimado: number
          motorista_nome: string | null
          origem_latitude: number | null
          origem_longitude: number | null
          origem_tipo: string | null
          placa: string | null
          programacao_id: string | null
          supervisao: string
          tipo: string
          veiculo_id: string | null
        }
        Insert: {
          colaborador_cpf?: string | null
          colaborador_nome?: string | null
          created_at?: string
          data_referencia: string
          duracao_estimada_min?: number
          geometria?: Json | null
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          km_total_estimado?: number
          motorista_nome?: string | null
          origem_latitude?: number | null
          origem_longitude?: number | null
          origem_tipo?: string | null
          placa?: string | null
          programacao_id?: string | null
          supervisao: string
          tipo: string
          veiculo_id?: string | null
        }
        Update: {
          colaborador_cpf?: string | null
          colaborador_nome?: string | null
          created_at?: string
          data_referencia?: string
          duracao_estimada_min?: number
          geometria?: Json | null
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          km_total_estimado?: number
          motorista_nome?: string | null
          origem_latitude?: number | null
          origem_longitude?: number | null
          origem_tipo?: string | null
          placa?: string | null
          programacao_id?: string | null
          supervisao?: string
          tipo?: string
          veiculo_id?: string | null
        }
        Relationships: []
      }
      operacional_mapa_rotas_paradas: {
        Row: {
          colaborador_nome: string | null
          distancia_km_trecho: number | null
          duracao_min_trecho: number | null
          embarque_texto: string | null
          id: string
          latitude: number | null
          longitude: number | null
          ordem: number
          os_id: string | null
          ponto_nome: string | null
          rota_id: string
          tipo: string
        }
        Insert: {
          colaborador_nome?: string | null
          distancia_km_trecho?: number | null
          duracao_min_trecho?: number | null
          embarque_texto?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          ordem: number
          os_id?: string | null
          ponto_nome?: string | null
          rota_id: string
          tipo: string
        }
        Update: {
          colaborador_nome?: string | null
          distancia_km_trecho?: number | null
          duracao_min_trecho?: number | null
          embarque_texto?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          ordem?: number
          os_id?: string | null
          ponto_nome?: string | null
          rota_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacional_mapa_rotas_paradas_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "operacional_mapa_rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      operacional_os: {
        Row: {
          arquivo_origem: string | null
          atualizar_resolvido_em: string | null
          atualizar_resolvido_por: string | null
          atualizar_resolvido_tipo: string | null
          cliente: string | null
          conferido_em: string | null
          conferido_por: string | null
          configurada_em: string | null
          contrato: string | null
          created_at: string
          data_os: string | null
          destino: string | null
          destino_latitude: number | null
          destino_longitude: number | null
          embarcado: number
          embarque: string | null
          enviado_logistica_em: string | null
          finalizado_em: string | null
          finalizado_por: string | null
          financeiro: string | null
          id: string
          logistica_assumido_em: string | null
          logistica_devolvido_em: string | null
          logistica_responsavel_id: string | null
          logistica_solicitado_por: string | null
          lote: number
          numero_os: string
          observacao_conferencia: string | null
          observacao_gestor: string | null
          observacao_logistica: string | null
          permitir_mais_classificadores: boolean
          ponto_embarque_id: string | null
          ponto1_latitude: number | null
          ponto1_longitude: number | null
          ponto1_nome: string | null
          produto: string | null
          raw: Json
          remanescente: number
          servico: string | null
          situacao: string | null
          status_conferencia: string
          status_gestor: string | null
          status_logistica: string | null
          supervisao: string | null
          ultima_atualizacao: string | null
          ultima_sync_batch_id: string | null
          ultima_sync_os_em: string | null
          updated_at: string
        }
        Insert: {
          arquivo_origem?: string | null
          atualizar_resolvido_em?: string | null
          atualizar_resolvido_por?: string | null
          atualizar_resolvido_tipo?: string | null
          cliente?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          configurada_em?: string | null
          contrato?: string | null
          created_at?: string
          data_os?: string | null
          destino?: string | null
          destino_latitude?: number | null
          destino_longitude?: number | null
          embarcado?: number
          embarque?: string | null
          enviado_logistica_em?: string | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          financeiro?: string | null
          id?: string
          logistica_assumido_em?: string | null
          logistica_devolvido_em?: string | null
          logistica_responsavel_id?: string | null
          logistica_solicitado_por?: string | null
          lote?: number
          numero_os: string
          observacao_conferencia?: string | null
          observacao_gestor?: string | null
          observacao_logistica?: string | null
          permitir_mais_classificadores?: boolean
          ponto_embarque_id?: string | null
          ponto1_latitude?: number | null
          ponto1_longitude?: number | null
          ponto1_nome?: string | null
          produto?: string | null
          raw?: Json
          remanescente?: number
          servico?: string | null
          situacao?: string | null
          status_conferencia?: string
          status_gestor?: string | null
          status_logistica?: string | null
          supervisao?: string | null
          ultima_atualizacao?: string | null
          ultima_sync_batch_id?: string | null
          ultima_sync_os_em?: string | null
          updated_at?: string
        }
        Update: {
          arquivo_origem?: string | null
          atualizar_resolvido_em?: string | null
          atualizar_resolvido_por?: string | null
          atualizar_resolvido_tipo?: string | null
          cliente?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          configurada_em?: string | null
          contrato?: string | null
          created_at?: string
          data_os?: string | null
          destino?: string | null
          destino_latitude?: number | null
          destino_longitude?: number | null
          embarcado?: number
          embarque?: string | null
          enviado_logistica_em?: string | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          financeiro?: string | null
          id?: string
          logistica_assumido_em?: string | null
          logistica_devolvido_em?: string | null
          logistica_responsavel_id?: string | null
          logistica_solicitado_por?: string | null
          lote?: number
          numero_os?: string
          observacao_conferencia?: string | null
          observacao_gestor?: string | null
          observacao_logistica?: string | null
          permitir_mais_classificadores?: boolean
          ponto_embarque_id?: string | null
          ponto1_latitude?: number | null
          ponto1_longitude?: number | null
          ponto1_nome?: string | null
          produto?: string | null
          raw?: Json
          remanescente?: number
          servico?: string | null
          situacao?: string | null
          status_conferencia?: string
          status_gestor?: string | null
          status_logistica?: string | null
          supervisao?: string | null
          ultima_atualizacao?: string | null
          ultima_sync_batch_id?: string | null
          ultima_sync_os_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacional_os_ponto_embarque_id_fkey"
            columns: ["ponto_embarque_id"]
            isOneToOne: false
            referencedRelation: "operacional_pontos_embarque"
            referencedColumns: ["id"]
          },
        ]
      }
      operacional_os_colaboradores: {
        Row: {
          colaborador_cpf: string | null
          colaborador_key: string
          colaborador_nome: string
          created_at: string
          distancia_km: number | null
          id: string
          indicado_por: string | null
          observacao: string | null
          origem_sugestao: string | null
          os_id: string
          updated_at: string
        }
        Insert: {
          colaborador_cpf?: string | null
          colaborador_key: string
          colaborador_nome: string
          created_at?: string
          distancia_km?: number | null
          id?: string
          indicado_por?: string | null
          observacao?: string | null
          origem_sugestao?: string | null
          os_id: string
          updated_at?: string
        }
        Update: {
          colaborador_cpf?: string | null
          colaborador_key?: string
          colaborador_nome?: string
          created_at?: string
          distancia_km?: number | null
          id?: string
          indicado_por?: string | null
          observacao?: string | null
          origem_sugestao?: string | null
          os_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacional_os_colaboradores_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "operacional_os"
            referencedColumns: ["id"]
          },
        ]
      }
      operacional_os_distribuicao: {
        Row: {
          created_at: string
          distribuido_por: string
          id: string
          motivo: string | null
          numero_os: string | null
          os_id: string
          redistribuicao: boolean
          responsavel_atual: string
        }
        Insert: {
          created_at?: string
          distribuido_por: string
          id?: string
          motivo?: string | null
          numero_os?: string | null
          os_id: string
          redistribuicao?: boolean
          responsavel_atual: string
        }
        Update: {
          created_at?: string
          distribuido_por?: string
          id?: string
          motivo?: string | null
          numero_os?: string | null
          os_id?: string
          redistribuicao?: boolean
          responsavel_atual?: string
        }
        Relationships: []
      }
      operacional_passagens_cache: {
        Row: {
          created_at: string
          data_cotacao: string
          destino_cidade: string
          destino_uf: string
          empresa: string | null
          fonte: string | null
          id: string
          origem_cidade: string
          origem_uf: string
          validade_ate: string | null
          valor_estimado: number
        }
        Insert: {
          created_at?: string
          data_cotacao?: string
          destino_cidade: string
          destino_uf: string
          empresa?: string | null
          fonte?: string | null
          id?: string
          origem_cidade: string
          origem_uf: string
          validade_ate?: string | null
          valor_estimado?: number
        }
        Update: {
          created_at?: string
          data_cotacao?: string
          destino_cidade?: string
          destino_uf?: string
          empresa?: string | null
          fonte?: string | null
          id?: string
          origem_cidade?: string
          origem_uf?: string
          validade_ate?: string | null
          valor_estimado?: number
        }
        Relationships: []
      }
      operacional_pontos_embarque: {
        Row: {
          ativo: boolean
          cidade: string
          coordenacao: string | null
          created_at: string
          embarque_label: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome_local: string
          origem: string
          spl_code: number | null
          supervisao: string | null
          tem_historico_problemas: boolean
          tipo_local: string | null
          uf: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade: string
          coordenacao?: string | null
          created_at?: string
          embarque_label?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome_local: string
          origem?: string
          spl_code?: number | null
          supervisao?: string | null
          tem_historico_problemas?: boolean
          tipo_local?: string | null
          uf: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string
          coordenacao?: string | null
          created_at?: string
          embarque_label?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome_local?: string
          origem?: string
          spl_code?: number | null
          supervisao?: string | null
          tem_historico_problemas?: boolean
          tipo_local?: string | null
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      operacional_simulacoes: {
        Row: {
          classificacao: string | null
          colaborador_base_id: string | null
          created_at: string
          custo_total: number | null
          detalhes: Json | null
          distancia_km: number | null
          embarque_id: string | null
          hotel_distancia_km: number | null
          hotel_id: string | null
          id: string
          score_auditoria: number | null
          score_final: number | null
          valor_alimentacao: number | null
          valor_hotel: number | null
          valor_mao_obra: number | null
          valor_passagem: number | null
        }
        Insert: {
          classificacao?: string | null
          colaborador_base_id?: string | null
          created_at?: string
          custo_total?: number | null
          detalhes?: Json | null
          distancia_km?: number | null
          embarque_id?: string | null
          hotel_distancia_km?: number | null
          hotel_id?: string | null
          id?: string
          score_auditoria?: number | null
          score_final?: number | null
          valor_alimentacao?: number | null
          valor_hotel?: number | null
          valor_mao_obra?: number | null
          valor_passagem?: number | null
        }
        Update: {
          classificacao?: string | null
          colaborador_base_id?: string | null
          created_at?: string
          custo_total?: number | null
          detalhes?: Json | null
          distancia_km?: number | null
          embarque_id?: string | null
          hotel_distancia_km?: number | null
          hotel_id?: string | null
          id?: string
          score_auditoria?: number | null
          score_final?: number | null
          valor_alimentacao?: number | null
          valor_hotel?: number | null
          valor_mao_obra?: number | null
          valor_passagem?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operacional_simulacoes_colaborador_base_id_fkey"
            columns: ["colaborador_base_id"]
            isOneToOne: false
            referencedRelation: "operacional_colaborador_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacional_simulacoes_colaborador_base_id_fkey"
            columns: ["colaborador_base_id"]
            isOneToOne: false
            referencedRelation: "vw_conferencia_uber_corridas"
            referencedColumns: ["colaborador_base_id"]
          },
          {
            foreignKeyName: "operacional_simulacoes_embarque_id_fkey"
            columns: ["embarque_id"]
            isOneToOne: false
            referencedRelation: "operacional_embarques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacional_simulacoes_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "operacional_hoteis"
            referencedColumns: ["id"]
          },
        ]
      }
      ouro_safra_classificacao_execucoes: {
        Row: {
          agendamento_id: string | null
          avariados: number | null
          duracao_ms: number | null
          erro: string | null
          id: string
          impureza: number | null
          iniciado_em: string
          os_grm: string | null
          placa: string | null
          status: string
          umidade: number | null
        }
        Insert: {
          agendamento_id?: string | null
          avariados?: number | null
          duracao_ms?: number | null
          erro?: string | null
          id?: string
          impureza?: number | null
          iniciado_em?: string
          os_grm?: string | null
          placa?: string | null
          status: string
          umidade?: number | null
        }
        Update: {
          agendamento_id?: string | null
          avariados?: number | null
          duracao_ms?: number | null
          erro?: string | null
          id?: string
          impureza?: number | null
          iniciado_em?: string
          os_grm?: string | null
          placa?: string | null
          status?: string
          umidade?: number | null
        }
        Relationships: []
      }
      painel_notificacoes: {
        Row: {
          arquivada: boolean
          arquivada_em: string | null
          chave_dedup: string | null
          created_at: string
          descricao: string | null
          destinatario_modulo: string | null
          destinatario_perfil: string | null
          destinatario_usuario_id: string | null
          gerado_por_usuario_id: string | null
          icone: string
          id: string
          meta: Json | null
          modulo_url: string | null
          prioridade: string
          referencia_id: string | null
          referencia_tabela: string | null
          supervisao: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          arquivada?: boolean
          arquivada_em?: string | null
          chave_dedup?: string | null
          created_at?: string
          descricao?: string | null
          destinatario_modulo?: string | null
          destinatario_perfil?: string | null
          destinatario_usuario_id?: string | null
          gerado_por_usuario_id?: string | null
          icone?: string
          id?: string
          meta?: Json | null
          modulo_url?: string | null
          prioridade?: string
          referencia_id?: string | null
          referencia_tabela?: string | null
          supervisao?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          arquivada?: boolean
          arquivada_em?: string | null
          chave_dedup?: string | null
          created_at?: string
          descricao?: string | null
          destinatario_modulo?: string | null
          destinatario_perfil?: string | null
          destinatario_usuario_id?: string | null
          gerado_por_usuario_id?: string | null
          icone?: string
          id?: string
          meta?: Json | null
          modulo_url?: string | null
          prioridade?: string
          referencia_id?: string | null
          referencia_tabela?: string | null
          supervisao?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      painel_notificacoes_usuarios: {
        Row: {
          created_at: string
          executada_em: string | null
          id: string
          lida_em: string | null
          notificacao_id: string
          usuario_id: string
          usuario_nome: string | null
        }
        Insert: {
          created_at?: string
          executada_em?: string | null
          id?: string
          lida_em?: string | null
          notificacao_id: string
          usuario_id: string
          usuario_nome?: string | null
        }
        Update: {
          created_at?: string
          executada_em?: string | null
          id?: string
          lida_em?: string | null
          notificacao_id?: string
          usuario_id?: string
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "painel_notificacoes_usuarios_notificacao_id_fkey"
            columns: ["notificacao_id"]
            isOneToOne: false
            referencedRelation: "painel_notificacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      patrimonio_solicitacoes: {
        Row: {
          acao: string | null
          colaborador: string | null
          created_at: string
          created_by: string | null
          data_solicitacao: string
          id: string
          item: string | null
          observacoes: string | null
          patrimonio_tag: string | null
          status: string
        }
        Insert: {
          acao?: string | null
          colaborador?: string | null
          created_at?: string
          created_by?: string | null
          data_solicitacao: string
          id?: string
          item?: string | null
          observacoes?: string | null
          patrimonio_tag?: string | null
          status?: string
        }
        Update: {
          acao?: string | null
          colaborador?: string | null
          created_at?: string
          created_by?: string | null
          data_solicitacao?: string
          id?: string
          item?: string | null
          observacoes?: string | null
          patrimonio_tag?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patrimonio_solicitacoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patrimonios_historico: {
        Row: {
          categoria: string | null
          coordenacao: string | null
          created_at: string
          data_aquisicao: string | null
          data_registro: string | null
          dias_sem_leitura: number | null
          funcionario: string | null
          hash_linha: string | null
          id: string
          identificacao: string | null
          importacao_id: string
          marca: string | null
          modelo: string | null
          patrimonio_codigo: string
          situacao: string | null
          supervisao: string | null
          ultima_leitura: string | null
        }
        Insert: {
          categoria?: string | null
          coordenacao?: string | null
          created_at?: string
          data_aquisicao?: string | null
          data_registro?: string | null
          dias_sem_leitura?: number | null
          funcionario?: string | null
          hash_linha?: string | null
          id?: string
          identificacao?: string | null
          importacao_id: string
          marca?: string | null
          modelo?: string | null
          patrimonio_codigo: string
          situacao?: string | null
          supervisao?: string | null
          ultima_leitura?: string | null
        }
        Update: {
          categoria?: string | null
          coordenacao?: string | null
          created_at?: string
          data_aquisicao?: string | null
          data_registro?: string | null
          dias_sem_leitura?: number | null
          funcionario?: string | null
          hash_linha?: string | null
          id?: string
          identificacao?: string | null
          importacao_id?: string
          marca?: string | null
          modelo?: string | null
          patrimonio_codigo?: string
          situacao?: string | null
          supervisao?: string | null
          ultima_leitura?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patrimonios_historico_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "patrimonios_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      patrimonios_historico_leituras: {
        Row: {
          categoria: string | null
          coordenacao: string | null
          created_at: string
          data_aquisicao: string | null
          data_registro: string | null
          data_upload: string
          dias_sem_leitura: number | null
          funcionario: string | null
          hash_linha: string | null
          id: number
          identificacao: string | null
          importacao_id: string | null
          importado_em: string
          marca: string | null
          modelo: string | null
          patrimonio_codigo: string
          situacao: string | null
          supervisao: string | null
          ultima_leitura: string | null
        }
        Insert: {
          categoria?: string | null
          coordenacao?: string | null
          created_at?: string
          data_aquisicao?: string | null
          data_registro?: string | null
          data_upload?: string
          dias_sem_leitura?: number | null
          funcionario?: string | null
          hash_linha?: string | null
          id?: number
          identificacao?: string | null
          importacao_id?: string | null
          importado_em?: string
          marca?: string | null
          modelo?: string | null
          patrimonio_codigo: string
          situacao?: string | null
          supervisao?: string | null
          ultima_leitura?: string | null
        }
        Update: {
          categoria?: string | null
          coordenacao?: string | null
          created_at?: string
          data_aquisicao?: string | null
          data_registro?: string | null
          data_upload?: string
          dias_sem_leitura?: number | null
          funcionario?: string | null
          hash_linha?: string | null
          id?: number
          identificacao?: string | null
          importacao_id?: string | null
          importado_em?: string
          marca?: string | null
          modelo?: string | null
          patrimonio_codigo?: string
          situacao?: string | null
          supervisao?: string | null
          ultima_leitura?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patrimonios_historico_leituras_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "patrimonios_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      patrimonios_importacoes: {
        Row: {
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          data_upload: string | null
          id: string
          nome_arquivo: string
          observacoes: string | null
          origem: string | null
          status: string
          total_erros: number
          total_importadas: number
          total_linhas: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_upload?: string | null
          id?: string
          nome_arquivo: string
          observacoes?: string | null
          origem?: string | null
          status?: string
          total_erros?: number
          total_importadas?: number
          total_linhas?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_upload?: string | null
          id?: string
          nome_arquivo?: string
          observacoes?: string | null
          origem?: string | null
          status?: string
          total_erros?: number
          total_importadas?: number
          total_linhas?: number
          updated_at?: string
        }
        Relationships: []
      }
      patrimonios_movimentacoes: {
        Row: {
          categoria: string | null
          created_at: string
          id: string
          identificacao: string | null
          observacao: string | null
          patrimonio_id: string
          regional: string | null
          responsavel_anterior: string | null
          responsavel_novo: string | null
          supervisao: string | null
          termo_id: string | null
          tipo: string
          usuario: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          id?: string
          identificacao?: string | null
          observacao?: string | null
          patrimonio_id: string
          regional?: string | null
          responsavel_anterior?: string | null
          responsavel_novo?: string | null
          supervisao?: string | null
          termo_id?: string | null
          tipo: string
          usuario: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          id?: string
          identificacao?: string | null
          observacao?: string | null
          patrimonio_id?: string
          regional?: string | null
          responsavel_anterior?: string | null
          responsavel_novo?: string | null
          supervisao?: string | null
          termo_id?: string | null
          tipo?: string
          usuario?: string
        }
        Relationships: [
          {
            foreignKeyName: "patrimonios_movimentacoes_termo_id_fkey"
            columns: ["termo_id"]
            isOneToOne: false
            referencedRelation: "termos_documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      patrimonios_snapshot: {
        Row: {
          categoria: string | null
          coordenacao: string | null
          created_at: string
          data_aquisicao: string | null
          data_registro: string | null
          data_upload: string | null
          dias_sem_leitura: number | null
          funcionario: string | null
          hash_linha: string | null
          id: string
          identificacao: string | null
          importacao_id: string
          importado_em: string | null
          marca: string | null
          modelo: string | null
          patrimonio_codigo: string
          situacao: string | null
          supervisao: string | null
          ultima_leitura: string | null
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          coordenacao?: string | null
          created_at?: string
          data_aquisicao?: string | null
          data_registro?: string | null
          data_upload?: string | null
          dias_sem_leitura?: number | null
          funcionario?: string | null
          hash_linha?: string | null
          id?: string
          identificacao?: string | null
          importacao_id: string
          importado_em?: string | null
          marca?: string | null
          modelo?: string | null
          patrimonio_codigo: string
          situacao?: string | null
          supervisao?: string | null
          ultima_leitura?: string | null
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          coordenacao?: string | null
          created_at?: string
          data_aquisicao?: string | null
          data_registro?: string | null
          data_upload?: string | null
          dias_sem_leitura?: number | null
          funcionario?: string | null
          hash_linha?: string | null
          id?: string
          identificacao?: string | null
          importacao_id?: string
          importado_em?: string | null
          marca?: string | null
          modelo?: string | null
          patrimonio_codigo?: string
          situacao?: string | null
          supervisao?: string | null
          ultima_leitura?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patrimonios_snapshot_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "patrimonios_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      producao_importacoes: {
        Row: {
          arquivo_nome: string | null
          created_at: string | null
          data_referencia: string
          id: string
          importado_por: string | null
          observacoes: string | null
          origem: string | null
          status: string | null
          total_linhas: number | null
        }
        Insert: {
          arquivo_nome?: string | null
          created_at?: string | null
          data_referencia: string
          id?: string
          importado_por?: string | null
          observacoes?: string | null
          origem?: string | null
          status?: string | null
          total_linhas?: number | null
        }
        Update: {
          arquivo_nome?: string | null
          created_at?: string | null
          data_referencia?: string
          id?: string
          importado_por?: string | null
          observacoes?: string | null
          origem?: string | null
          status?: string | null
          total_linhas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "producao_importacoes_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producao_snapshot: {
        Row: {
          cargas: number | null
          checkin: string | null
          checkout: string | null
          cidade: string | null
          cliente: string | null
          coordenacao: string | null
          created_at: string | null
          data: string | null
          data_referencia: string
          funcionario: string | null
          id: string
          importacao_id: string | null
          local_embarque: string | null
          os: string | null
          servico: string | null
          supervisao: string | null
          tipo: string | null
          tons: number | null
        }
        Insert: {
          cargas?: number | null
          checkin?: string | null
          checkout?: string | null
          cidade?: string | null
          cliente?: string | null
          coordenacao?: string | null
          created_at?: string | null
          data?: string | null
          data_referencia: string
          funcionario?: string | null
          id?: string
          importacao_id?: string | null
          local_embarque?: string | null
          os?: string | null
          servico?: string | null
          supervisao?: string | null
          tipo?: string | null
          tons?: number | null
        }
        Update: {
          cargas?: number | null
          checkin?: string | null
          checkout?: string | null
          cidade?: string | null
          cliente?: string | null
          coordenacao?: string | null
          created_at?: string | null
          data?: string | null
          data_referencia?: string
          funcionario?: string | null
          id?: string
          importacao_id?: string | null
          local_embarque?: string | null
          os?: string | null
          servico?: string | null
          supervisao?: string | null
          tipo?: string | null
          tons?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "producao_snapshot_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "producao_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      producao_snapshot_staging: {
        Row: {
          cargas: number | null
          checkin: string | null
          checkout: string | null
          cidade: string | null
          cliente: string | null
          coordenacao: string | null
          created_at: string | null
          data: string | null
          data_referencia: string
          funcionario: string | null
          id: string
          importacao_id: string | null
          local_embarque: string | null
          os: string | null
          servico: string | null
          supervisao: string | null
          tipo: string | null
          tons: number | null
        }
        Insert: {
          cargas?: number | null
          checkin?: string | null
          checkout?: string | null
          cidade?: string | null
          cliente?: string | null
          coordenacao?: string | null
          created_at?: string | null
          data?: string | null
          data_referencia: string
          funcionario?: string | null
          id?: string
          importacao_id?: string | null
          local_embarque?: string | null
          os?: string | null
          servico?: string | null
          supervisao?: string | null
          tipo?: string | null
          tons?: number | null
        }
        Update: {
          cargas?: number | null
          checkin?: string | null
          checkout?: string | null
          cidade?: string | null
          cliente?: string | null
          coordenacao?: string | null
          created_at?: string | null
          data?: string | null
          data_referencia?: string
          funcionario?: string | null
          id?: string
          importacao_id?: string | null
          local_embarque?: string | null
          os?: string | null
          servico?: string | null
          supervisao?: string | null
          tipo?: string | null
          tons?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          can_manage_modules: boolean
          can_manage_settings: boolean
          can_manage_users: boolean
          can_view_all_departments: boolean
          created_at: string
          department_id: string | null
          email: string | null
          full_name: string
          id: string
          is_master: boolean
          role: string
          updated_at: string
          username: string | null
        }
        Insert: {
          active?: boolean
          can_manage_modules?: boolean
          can_manage_settings?: boolean
          can_manage_users?: boolean
          can_view_all_departments?: boolean
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name: string
          id: string
          is_master?: boolean
          role?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          active?: boolean
          can_manage_modules?: boolean
          can_manage_settings?: boolean
          can_manage_users?: boolean
          can_view_all_departments?: boolean
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_master?: boolean
          role?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao: {
        Row: {
          cliente: string | null
          created_at: string | null
          created_by: string | null
          data: string
          descricao: string | null
          id: string
          local: string | null
          responsavel: string | null
          status: string | null
        }
        Insert: {
          cliente?: string | null
          created_at?: string | null
          created_by?: string | null
          data: string
          descricao?: string | null
          id?: string
          local?: string | null
          responsavel?: string | null
          status?: string | null
        }
        Update: {
          cliente?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string
          descricao?: string | null
          id?: string
          local?: string | null
          responsavel?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_alimentacao: {
        Row: {
          almoco: boolean
          cafe: boolean
          colaborador_id: string
          created_at: string
          data_referencia: string | null
          id: string
          janta: boolean
          nome_colaborador: string | null
          observacao: string | null
          programacao_id: string | null
          updated_at: string
        }
        Insert: {
          almoco?: boolean
          cafe?: boolean
          colaborador_id: string
          created_at?: string
          data_referencia?: string | null
          id?: string
          janta?: boolean
          nome_colaborador?: string | null
          observacao?: string | null
          programacao_id?: string | null
          updated_at?: string
        }
        Update: {
          almoco?: boolean
          cafe?: boolean
          colaborador_id?: string
          created_at?: string
          data_referencia?: string | null
          id?: string
          janta?: boolean
          nome_colaborador?: string | null
          observacao?: string | null
          programacao_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_alimentacao_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_alimentacao_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_colaborador: {
        Row: {
          almoco: boolean
          alojamento_id: string | null
          cafe: boolean
          checkin: string | null
          checkout: string | null
          chegada: string | null
          cidade_uf: string | null
          colaborador_id: string
          created_at: string
          data_referencia: string
          estadia: string | null
          id: string
          janta: boolean
          lavagem: number | null
          manutencao_solicitada: boolean
          nome: string
          recarga: number | null
          status: string
          transporte: string | null
          updated_at: string
        }
        Insert: {
          almoco?: boolean
          alojamento_id?: string | null
          cafe?: boolean
          checkin?: string | null
          checkout?: string | null
          chegada?: string | null
          cidade_uf?: string | null
          colaborador_id: string
          created_at?: string
          data_referencia?: string
          estadia?: string | null
          id?: string
          janta?: boolean
          lavagem?: number | null
          manutencao_solicitada?: boolean
          nome: string
          recarga?: number | null
          status: string
          transporte?: string | null
          updated_at?: string
        }
        Update: {
          almoco?: boolean
          alojamento_id?: string | null
          cafe?: boolean
          checkin?: string | null
          checkout?: string | null
          chegada?: string | null
          cidade_uf?: string | null
          colaborador_id?: string
          created_at?: string
          data_referencia?: string
          estadia?: string | null
          id?: string
          janta?: boolean
          lavagem?: number | null
          manutencao_solicitada?: boolean
          nome?: string
          recarga?: number | null
          status?: string
          transporte?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_colaborador_alojamento_id_fkey"
            columns: ["alojamento_id"]
            isOneToOne: false
            referencedRelation: "alojamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_colaborador_alojamento_id_fkey"
            columns: ["alojamento_id"]
            isOneToOne: false
            referencedRelation: "vw_alojamentos_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_colaboradores: {
        Row: {
          cargo: string | null
          colaborador_id: string
          coordenacao: string | null
          created_at: string
          data_referencia: string | null
          disponibilidade: string
          id: string
          nome_colaborador: string | null
          observacao: string | null
          placa_veiculo: string | null
          programacao_id: string | null
          supervisao: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          colaborador_id: string
          coordenacao?: string | null
          created_at?: string
          data_referencia?: string | null
          disponibilidade?: string
          id?: string
          nome_colaborador?: string | null
          observacao?: string | null
          placa_veiculo?: string | null
          programacao_id?: string | null
          supervisao?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          colaborador_id?: string
          coordenacao?: string | null
          created_at?: string
          data_referencia?: string | null
          disponibilidade?: string
          id?: string
          nome_colaborador?: string | null
          observacao?: string | null
          placa_veiculo?: string | null
          programacao_id?: string | null
          supervisao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_colaboradores_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_colaboradores_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_conferencia_status: {
        Row: {
          colaborador_id: string
          conferido_em: string | null
          conferido_por: string | null
          conferido_por_nome: string | null
          coordenacao: string | null
          created_at: string
          data_referencia: string | null
          id: string
          nome_colaborador: string | null
          observacao_conferencia: string | null
          programacao_id: string
          status_conferencia: string
          supervisao: string | null
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          conferido_em?: string | null
          conferido_por?: string | null
          conferido_por_nome?: string | null
          coordenacao?: string | null
          created_at?: string
          data_referencia?: string | null
          id?: string
          nome_colaborador?: string | null
          observacao_conferencia?: string | null
          programacao_id: string
          status_conferencia?: string
          supervisao?: string | null
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          conferido_em?: string | null
          conferido_por?: string | null
          conferido_por_nome?: string | null
          coordenacao?: string | null
          created_at?: string
          data_referencia?: string | null
          id?: string
          nome_colaborador?: string | null
          observacao_conferencia?: string | null
          programacao_id?: string
          status_conferencia?: string
          supervisao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_conferencia_status_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_conferencia_status_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_contextos: {
        Row: {
          created_at: string
          created_by: string | null
          data_referencia: string
          id: string
          supervisao: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_referencia: string
          id?: string
          supervisao: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_referencia?: string
          id?: string
          supervisao?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_contextos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_deslocamento: {
        Row: {
          colaborador_id: string
          created_at: string
          data_referencia: string | null
          destino: string | null
          id: string
          km: number
          nome_colaborador: string | null
          observacao: string | null
          origem: string | null
          placa_veiculo: string | null
          programacao_id: string | null
          tipo_deslocamento: string
          updated_at: string
          valor: number
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data_referencia?: string | null
          destino?: string | null
          id?: string
          km?: number
          nome_colaborador?: string | null
          observacao?: string | null
          origem?: string | null
          placa_veiculo?: string | null
          programacao_id?: string | null
          tipo_deslocamento?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data_referencia?: string | null
          destino?: string | null
          id?: string
          km?: number
          nome_colaborador?: string | null
          observacao?: string | null
          origem?: string | null
          placa_veiculo?: string | null
          programacao_id?: string | null
          tipo_deslocamento?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "programacao_deslocamento_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_deslocamento_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_despesas: {
        Row: {
          almoco_valor: boolean | null
          cafe_valor: boolean | null
          colaborador: string
          conferido_em: string | null
          conferido_por: string | null
          conferido_por_nome: string | null
          coordenacao: string | null
          created_at: string
          data_referencia: string
          deslocamento_obs: string | null
          deslocamento_tipo: string | null
          disponibilidade_obs: string | null
          disponibilidade_status: string | null
          estadia_obs: string | null
          estadia_tipo: string | null
          extras_lavagem_valor: number | null
          extras_obs: string | null
          extras_passagem_valor: number | null
          extras_recarga_valor: number | null
          hotel_chegada: string | null
          hotel_dias: number | null
          id: string
          janta_valor: boolean | null
          manut_veic: string | null
          observacao_conferencia: string | null
          origem: string | null
          queue_id: string | null
          solicitante: string | null
          status_conferencia: string
          supervisao: string | null
          updated_at: string
        }
        Insert: {
          almoco_valor?: boolean | null
          cafe_valor?: boolean | null
          colaborador: string
          conferido_em?: string | null
          conferido_por?: string | null
          conferido_por_nome?: string | null
          coordenacao?: string | null
          created_at?: string
          data_referencia: string
          deslocamento_obs?: string | null
          deslocamento_tipo?: string | null
          disponibilidade_obs?: string | null
          disponibilidade_status?: string | null
          estadia_obs?: string | null
          estadia_tipo?: string | null
          extras_lavagem_valor?: number | null
          extras_obs?: string | null
          extras_passagem_valor?: number | null
          extras_recarga_valor?: number | null
          hotel_chegada?: string | null
          hotel_dias?: number | null
          id?: string
          janta_valor?: boolean | null
          manut_veic?: string | null
          observacao_conferencia?: string | null
          origem?: string | null
          queue_id?: string | null
          solicitante?: string | null
          status_conferencia?: string
          supervisao?: string | null
          updated_at?: string
        }
        Update: {
          almoco_valor?: boolean | null
          cafe_valor?: boolean | null
          colaborador?: string
          conferido_em?: string | null
          conferido_por?: string | null
          conferido_por_nome?: string | null
          coordenacao?: string | null
          created_at?: string
          data_referencia?: string
          deslocamento_obs?: string | null
          deslocamento_tipo?: string | null
          disponibilidade_obs?: string | null
          disponibilidade_status?: string | null
          estadia_obs?: string | null
          estadia_tipo?: string | null
          extras_lavagem_valor?: number | null
          extras_obs?: string | null
          extras_passagem_valor?: number | null
          extras_recarga_valor?: number | null
          hotel_chegada?: string | null
          hotel_dias?: number | null
          id?: string
          janta_valor?: boolean | null
          manut_veic?: string | null
          observacao_conferencia?: string | null
          origem?: string | null
          queue_id?: string | null
          solicitante?: string | null
          status_conferencia?: string
          supervisao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      programacao_despesas_dedup_archive: {
        Row: {
          archived_at: string
          payload: Json
          reason: string
          source_id: string
          source_table: string
        }
        Insert: {
          archived_at?: string
          payload: Json
          reason?: string
          source_id: string
          source_table: string
        }
        Update: {
          archived_at?: string
          payload?: Json
          reason?: string
          source_id?: string
          source_table?: string
        }
        Relationships: []
      }
      programacao_despesas_hist: {
        Row: {
          acao: string | null
          antes: Json | null
          chave: string | null
          created_at: string | null
          depois: Json | null
          id: string
          programacao_despesa_id: string | null
          queue_id: string | null
          solicitante: string | null
        }
        Insert: {
          acao?: string | null
          antes?: Json | null
          chave?: string | null
          created_at?: string | null
          depois?: Json | null
          id?: string
          programacao_despesa_id?: string | null
          queue_id?: string | null
          solicitante?: string | null
        }
        Update: {
          acao?: string | null
          antes?: Json | null
          chave?: string | null
          created_at?: string | null
          depois?: Json | null
          id?: string
          programacao_despesa_id?: string | null
          queue_id?: string | null
          solicitante?: string | null
        }
        Relationships: []
      }
      programacao_dia: {
        Row: {
          coordenacao: string | null
          created_at: string
          criado_por: string | null
          data_referencia: string
          id: string
          regional: string | null
          status: string
          supervisao: string | null
          updated_at: string
        }
        Insert: {
          coordenacao?: string | null
          created_at?: string
          criado_por?: string | null
          data_referencia: string
          id?: string
          regional?: string | null
          status?: string
          supervisao?: string | null
          updated_at?: string
        }
        Update: {
          coordenacao?: string | null
          created_at?: string
          criado_por?: string | null
          data_referencia?: string
          id?: string
          regional?: string | null
          status?: string
          supervisao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      programacao_distribuicao_agendada: {
        Row: {
          created_at: string
          data_referencia: string
          id: string
          processado: boolean
          processado_em: string | null
          programacao_id: string | null
          supervisao: string
        }
        Insert: {
          created_at?: string
          data_referencia: string
          id?: string
          processado?: boolean
          processado_em?: string | null
          programacao_id?: string | null
          supervisao: string
        }
        Update: {
          created_at?: string
          data_referencia?: string
          id?: string
          processado?: boolean
          processado_em?: string | null
          programacao_id?: string | null
          supervisao?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_distribuicao_agendada_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_distribuicao_agendada_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_encaminhamentos: {
        Row: {
          id: string
          modulo_destino: string
          motivo: string | null
          observacoes: string | null
          processado_em: string | null
          programacao_id: string
          programacao_item_id: string
          setor_destino: string
          solicitado_em: string
          status: string
        }
        Insert: {
          id?: string
          modulo_destino: string
          motivo?: string | null
          observacoes?: string | null
          processado_em?: string | null
          programacao_id: string
          programacao_item_id: string
          setor_destino: string
          solicitado_em?: string
          status?: string
        }
        Update: {
          id?: string
          modulo_destino?: string
          motivo?: string | null
          observacoes?: string | null
          processado_em?: string | null
          programacao_id?: string
          programacao_item_id?: string
          setor_destino?: string
          solicitado_em?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_encaminhamentos_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_equipe: {
        Row: {
          colaborador_id: string
          confirmado: boolean
          created_at: string
          duracao_min: number | null
          id: string
          km_estimado: number | null
          nome_colaborador: string | null
          ordem_rota: number | null
          os_id: string
          programacao_id: string
          rota_calculada_em: string | null
          rota_geometria: Json | null
          score: number | null
          score_auditoria: number | null
          score_contrato: number | null
          score_distancia: number | null
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          confirmado?: boolean
          created_at?: string
          duracao_min?: number | null
          id?: string
          km_estimado?: number | null
          nome_colaborador?: string | null
          ordem_rota?: number | null
          os_id: string
          programacao_id: string
          rota_calculada_em?: string | null
          rota_geometria?: Json | null
          score?: number | null
          score_auditoria?: number | null
          score_contrato?: number | null
          score_distancia?: number | null
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          confirmado?: boolean
          created_at?: string
          duracao_min?: number | null
          id?: string
          km_estimado?: number | null
          nome_colaborador?: string | null
          ordem_rota?: number | null
          os_id?: string
          programacao_id?: string
          rota_calculada_em?: string | null
          rota_geometria?: Json | null
          score?: number | null
          score_auditoria?: number | null
          score_contrato?: number | null
          score_distancia?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_equipe_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "operacional_os"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_equipe_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_equipe_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_estadia: {
        Row: {
          alojamento_id: string | null
          alojamento_nome: string | null
          checkin: string | null
          checkout: string | null
          cidade: string | null
          colaborador_id: string
          created_at: string
          data_referencia: string | null
          diarias: number
          id: string
          nome_colaborador: string | null
          observacao: string | null
          programacao_id: string | null
          tem_estadia: boolean
          tipo_estadia: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          alojamento_id?: string | null
          alojamento_nome?: string | null
          checkin?: string | null
          checkout?: string | null
          cidade?: string | null
          colaborador_id: string
          created_at?: string
          data_referencia?: string | null
          diarias?: number
          id?: string
          nome_colaborador?: string | null
          observacao?: string | null
          programacao_id?: string | null
          tem_estadia?: boolean
          tipo_estadia?: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          alojamento_id?: string | null
          alojamento_nome?: string | null
          checkin?: string | null
          checkout?: string | null
          cidade?: string | null
          colaborador_id?: string
          created_at?: string
          data_referencia?: string | null
          diarias?: number
          id?: string
          nome_colaborador?: string | null
          observacao?: string | null
          programacao_id?: string | null
          tem_estadia?: boolean
          tipo_estadia?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_estadia_alojamento_id_fkey"
            columns: ["alojamento_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_alojamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_estadia_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_estadia_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_extras: {
        Row: {
          colaborador_id: string
          created_at: string
          data_referencia: string | null
          descricao: string | null
          id: string
          nome_colaborador: string | null
          observacao: string | null
          programacao_id: string | null
          tipo_despesa: string
          updated_at: string
          valor: number
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data_referencia?: string | null
          descricao?: string | null
          id?: string
          nome_colaborador?: string | null
          observacao?: string | null
          programacao_id?: string | null
          tipo_despesa?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data_referencia?: string | null
          descricao?: string | null
          id?: string
          nome_colaborador?: string | null
          observacao?: string | null
          programacao_id?: string | null
          tipo_despesa?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "programacao_extras_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_extras_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_frota_vinculos: {
        Row: {
          alvo_colaborador_id: string | null
          alvo_colaborador_nome: string | null
          alvo_tipo: string
          chave_vinculo: string
          created_at: string
          data_referencia: string | null
          frota_colaborador_id: string
          frota_nome: string | null
          id: string
          os_id: string
          placa_veiculo: string
          programacao_id: string
          tipo_atuacao: string
          updated_at: string
        }
        Insert: {
          alvo_colaborador_id?: string | null
          alvo_colaborador_nome?: string | null
          alvo_tipo: string
          chave_vinculo: string
          created_at?: string
          data_referencia?: string | null
          frota_colaborador_id: string
          frota_nome?: string | null
          id?: string
          os_id: string
          placa_veiculo: string
          programacao_id: string
          tipo_atuacao: string
          updated_at?: string
        }
        Update: {
          alvo_colaborador_id?: string | null
          alvo_colaborador_nome?: string | null
          alvo_tipo?: string
          chave_vinculo?: string
          created_at?: string
          data_referencia?: string | null
          frota_colaborador_id?: string
          frota_nome?: string | null
          id?: string
          os_id?: string
          placa_veiculo?: string
          programacao_id?: string
          tipo_atuacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_frota_vinculos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "operacional_os"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_hist: {
        Row: {
          acao: string
          antes: Json | null
          chave: string | null
          created_at: string
          depois: Json | null
          entidade_tipo: string
          id: string
          programacao_id: string | null
          programacao_item_id: string | null
          queue_id: string | null
          solicitante_nome: string | null
          solicitante_user_id: string | null
        }
        Insert: {
          acao: string
          antes?: Json | null
          chave?: string | null
          created_at?: string
          depois?: Json | null
          entidade_tipo: string
          id?: string
          programacao_id?: string | null
          programacao_item_id?: string | null
          queue_id?: string | null
          solicitante_nome?: string | null
          solicitante_user_id?: string | null
        }
        Update: {
          acao?: string
          antes?: Json | null
          chave?: string | null
          created_at?: string
          depois?: Json | null
          entidade_tipo?: string
          id?: string
          programacao_id?: string | null
          programacao_item_id?: string | null
          queue_id?: string | null
          solicitante_nome?: string | null
          solicitante_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_hist_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_inativacao_solicitacoes: {
        Row: {
          cargo: string | null
          colaborador_id: string
          coordenacao: string | null
          data_referencia: string | null
          id: string
          motivo: string
          nome_colaborador: string
          observacao_rh: string | null
          processado_em: string | null
          processado_por: string | null
          processado_por_nome: string | null
          programacao_id: string | null
          solicitado_em: string
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          supervisao: string | null
        }
        Insert: {
          cargo?: string | null
          colaborador_id: string
          coordenacao?: string | null
          data_referencia?: string | null
          id?: string
          motivo: string
          nome_colaborador: string
          observacao_rh?: string | null
          processado_em?: string | null
          processado_por?: string | null
          processado_por_nome?: string | null
          programacao_id?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          solicitado_por_nome?: string | null
          status?: string
          supervisao?: string | null
        }
        Update: {
          cargo?: string | null
          colaborador_id?: string
          coordenacao?: string | null
          data_referencia?: string | null
          id?: string
          motivo?: string
          nome_colaborador?: string
          observacao_rh?: string | null
          processado_em?: string | null
          processado_por?: string | null
          processado_por_nome?: string | null
          programacao_id?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          solicitado_por_nome?: string | null
          status?: string
          supervisao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_inativacao_solicitacoes_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_inativacao_solicitacoes_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_indisponibilidade_informados: {
        Row: {
          cargo: string | null
          colaborador_cpf: string | null
          colaborador_id: string
          colaborador_nome: string
          coordenacao: string | null
          created_at: string
          data_referencia: string
          id: string
          informado_em: string
          informado_por: string | null
          informado_por_nome: string | null
          observacao: string | null
          observacao_rh: string | null
          origem: string
          processado_em: string | null
          processado_por: string | null
          processado_por_nome: string | null
          programacao_id: string | null
          status: string
          supervisao: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          colaborador_cpf?: string | null
          colaborador_id: string
          colaborador_nome: string
          coordenacao?: string | null
          created_at?: string
          data_referencia: string
          id?: string
          informado_em?: string
          informado_por?: string | null
          informado_por_nome?: string | null
          observacao?: string | null
          observacao_rh?: string | null
          origem?: string
          processado_em?: string | null
          processado_por?: string | null
          processado_por_nome?: string | null
          programacao_id?: string | null
          status?: string
          supervisao?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          colaborador_cpf?: string | null
          colaborador_id?: string
          colaborador_nome?: string
          coordenacao?: string | null
          created_at?: string
          data_referencia?: string
          id?: string
          informado_em?: string
          informado_por?: string | null
          informado_por_nome?: string | null
          observacao?: string | null
          observacao_rh?: string | null
          origem?: string
          processado_em?: string | null
          processado_por?: string | null
          processado_por_nome?: string | null
          programacao_id?: string | null
          status?: string
          supervisao?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      programacao_itens: {
        Row: {
          alimentacao_necessaria: boolean
          alimentacao_obs: string | null
          alimentacao_tipo: string | null
          colaborador_cpf: string
          colaborador_nome: string
          contexto_id: string
          created_at: string
          deslocamento_destino: string | null
          deslocamento_necessario: boolean
          deslocamento_obs: string | null
          deslocamento_origem: string | null
          deslocamento_tipo: string | null
          disponibilidade_marcado: boolean
          disponibilidade_obs: string | null
          estadia_checkin: string | null
          estadia_checkout: string | null
          estadia_local: string | null
          estadia_necessaria: boolean
          estadia_obs: string | null
          extras_necessario: boolean
          extras_obs: string | null
          extras_tipo: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alimentacao_necessaria?: boolean
          alimentacao_obs?: string | null
          alimentacao_tipo?: string | null
          colaborador_cpf: string
          colaborador_nome: string
          contexto_id: string
          created_at?: string
          deslocamento_destino?: string | null
          deslocamento_necessario?: boolean
          deslocamento_obs?: string | null
          deslocamento_origem?: string | null
          deslocamento_tipo?: string | null
          disponibilidade_marcado?: boolean
          disponibilidade_obs?: string | null
          estadia_checkin?: string | null
          estadia_checkout?: string | null
          estadia_local?: string | null
          estadia_necessaria?: boolean
          estadia_obs?: string | null
          extras_necessario?: boolean
          extras_obs?: string | null
          extras_tipo?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alimentacao_necessaria?: boolean
          alimentacao_obs?: string | null
          alimentacao_tipo?: string | null
          colaborador_cpf?: string
          colaborador_nome?: string
          contexto_id?: string
          created_at?: string
          deslocamento_destino?: string | null
          deslocamento_necessario?: boolean
          deslocamento_obs?: string | null
          deslocamento_origem?: string | null
          deslocamento_tipo?: string | null
          disponibilidade_marcado?: boolean
          disponibilidade_obs?: string | null
          estadia_checkin?: string | null
          estadia_checkout?: string | null
          estadia_local?: string | null
          estadia_necessaria?: boolean
          estadia_obs?: string | null
          extras_necessario?: boolean
          extras_obs?: string | null
          extras_tipo?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_itens_contexto_id_fkey"
            columns: ["contexto_id"]
            isOneToOne: false
            referencedRelation: "programacao_contextos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_itens_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_recusas_respostas: {
        Row: {
          anexos_urls: Json
          colaborador_id: string
          conferencia_status_id: string
          created_at: string
          data_referencia: string | null
          id: string
          motivo: string | null
          programacao_id: string
          respondido_por: string | null
          respondido_por_nome: string | null
          resposta: string
          updated_at: string
        }
        Insert: {
          anexos_urls?: Json
          colaborador_id: string
          conferencia_status_id: string
          created_at?: string
          data_referencia?: string | null
          id?: string
          motivo?: string | null
          programacao_id: string
          respondido_por?: string | null
          respondido_por_nome?: string | null
          resposta: string
          updated_at?: string
        }
        Update: {
          anexos_urls?: Json
          colaborador_id?: string
          conferencia_status_id?: string
          created_at?: string
          data_referencia?: string | null
          id?: string
          motivo?: string | null
          programacao_id?: string
          respondido_por?: string | null
          respondido_por_nome?: string | null
          resposta?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_recusas_respostas_conferencia_status_id_fkey"
            columns: ["conferencia_status_id"]
            isOneToOne: true
            referencedRelation: "programacao_conferencia_status"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_transferencias: {
        Row: {
          chegada_confirmada_em: string | null
          chegada_confirmada_por_nome: string | null
          chegada_prevista: string | null
          colaborador_cargo: string | null
          colaborador_cpf: string
          colaborador_nome: string
          coordenacao_origem: string | null
          created_at: string
          em_deslocamento: boolean
          grm_aplicado_em: string | null
          grm_erro: string | null
          grm_locked_at: string | null
          grm_resultado: Json | null
          grm_status: string
          grm_tentativas: number
          id: string
          motivo: string | null
          motivo_recusa: string | null
          patrimonios: Json
          respondido_em: string | null
          respondido_por: string | null
          respondido_por_nome: string | null
          solicitado_em: string
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          supervisao_destino: string
          supervisao_origem: string
          tipo: string
          transferir_patrimonios: boolean
          updated_at: string
        }
        Insert: {
          chegada_confirmada_em?: string | null
          chegada_confirmada_por_nome?: string | null
          chegada_prevista?: string | null
          colaborador_cargo?: string | null
          colaborador_cpf: string
          colaborador_nome: string
          coordenacao_origem?: string | null
          created_at?: string
          em_deslocamento?: boolean
          grm_aplicado_em?: string | null
          grm_erro?: string | null
          grm_locked_at?: string | null
          grm_resultado?: Json | null
          grm_status?: string
          grm_tentativas?: number
          id?: string
          motivo?: string | null
          motivo_recusa?: string | null
          patrimonios?: Json
          respondido_em?: string | null
          respondido_por?: string | null
          respondido_por_nome?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          solicitado_por_nome?: string | null
          status?: string
          supervisao_destino: string
          supervisao_origem: string
          tipo?: string
          transferir_patrimonios: boolean
          updated_at?: string
        }
        Update: {
          chegada_confirmada_em?: string | null
          chegada_confirmada_por_nome?: string | null
          chegada_prevista?: string | null
          colaborador_cargo?: string | null
          colaborador_cpf?: string
          colaborador_nome?: string
          coordenacao_origem?: string | null
          created_at?: string
          em_deslocamento?: boolean
          grm_aplicado_em?: string | null
          grm_erro?: string | null
          grm_locked_at?: string | null
          grm_resultado?: Json | null
          grm_status?: string
          grm_tentativas?: number
          id?: string
          motivo?: string | null
          motivo_recusa?: string | null
          patrimonios?: Json
          respondido_em?: string | null
          respondido_por?: string | null
          respondido_por_nome?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          solicitado_por_nome?: string | null
          status?: string
          supervisao_destino?: string
          supervisao_origem?: string
          tipo?: string
          transferir_patrimonios?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      programacao_usuario_supervisoes: {
        Row: {
          app_usuario_id: string | null
          ativo: boolean
          auth_user_id: string | null
          created_at: string
          id: string
          supervisao: string
          updated_at: string
        }
        Insert: {
          app_usuario_id?: string | null
          ativo?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          supervisao: string
          updated_at?: string
        }
        Update: {
          app_usuario_id?: string | null
          ativo?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          supervisao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacao_usuario_supervisoes_app_usuario_id_fkey"
            columns: ["app_usuario_id"]
            isOneToOne: false
            referencedRelation: "app_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_usuario_supervisoes_app_usuario_id_fkey"
            columns: ["app_usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_contexto_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "programacao_usuario_supervisoes_app_usuario_id_fkey"
            columns: ["app_usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_usuario_modulos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      programacao_veiculo_proprio: {
        Row: {
          ativo: boolean
          colaborador_id: string
          created_at: string
          criado_por: string | null
          id: string
          nome: string | null
          observacao: string | null
          tarifa_km: number
          tipo_deslocamento: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          colaborador_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string | null
          observacao?: string | null
          tarifa_km?: number
          tipo_deslocamento?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          colaborador_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string | null
          observacao?: string | null
          tarifa_km?: number
          tipo_deslocamento?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      programacoes: {
        Row: {
          coordenacao: string | null
          created_at: string
          data_referencia: string
          id: string
          observacoes: string | null
          origem: string
          solicitante_nome: string | null
          solicitante_user_id: string | null
          status: string
          supervisao: string | null
          updated_at: string
        }
        Insert: {
          coordenacao?: string | null
          created_at?: string
          data_referencia: string
          id?: string
          observacoes?: string | null
          origem?: string
          solicitante_nome?: string | null
          solicitante_user_id?: string | null
          status?: string
          supervisao?: string | null
          updated_at?: string
        }
        Update: {
          coordenacao?: string | null
          created_at?: string
          data_referencia?: string
          id?: string
          observacoes?: string | null
          origem?: string
          solicitante_nome?: string | null
          solicitante_user_id?: string | null
          status?: string
          supervisao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      propostas_comerciais: {
        Row: {
          add_claf: string | null
          add_sup: string | null
          arquivo_drive_id: string | null
          arquivo_drive_nome: string | null
          aud: string | null
          cad: string | null
          campos: Json
          cargo: string | null
          cif: string | null
          cliente: string
          created_at: string
          created_by: string | null
          created_by_nome: string | null
          data_aceite_proposta: string | null
          data_proposta: string | null
          email: string | null
          email_contato: string | null
          estados: string | null
          fob: string | null
          formato_ultima_geracao: string | null
          gerada_em: string | null
          id: string
          intacta: string | null
          lacrar: string | null
          link_contrato: string | null
          link_proposta: string | null
          m_12h: string | null
          m_8h: string | null
          modelo_doc_id: string
          nome_contato: string | null
          numero: string
          observacao: string | null
          pasta_destino_id: string
          prazo_fatura: string | null
          prazo_final: string | null
          prazo_inicial: string | null
          prazo_pgto: string | null
          quality: string | null
          solicitante: string | null
          status: string
          t_aflac: string | null
          t_aflas: string | null
          t_don: string | null
          t_gmoc: string | null
          t_gmos: string | null
          telefone: string | null
          tipo_modelo: string
          tn: string | null
          updated_at: string
          whatsapp_contato: string | null
        }
        Insert: {
          add_claf?: string | null
          add_sup?: string | null
          arquivo_drive_id?: string | null
          arquivo_drive_nome?: string | null
          aud?: string | null
          cad?: string | null
          campos?: Json
          cargo?: string | null
          cif?: string | null
          cliente: string
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          data_aceite_proposta?: string | null
          data_proposta?: string | null
          email?: string | null
          email_contato?: string | null
          estados?: string | null
          fob?: string | null
          formato_ultima_geracao?: string | null
          gerada_em?: string | null
          id?: string
          intacta?: string | null
          lacrar?: string | null
          link_contrato?: string | null
          link_proposta?: string | null
          m_12h?: string | null
          m_8h?: string | null
          modelo_doc_id?: string
          nome_contato?: string | null
          numero: string
          observacao?: string | null
          pasta_destino_id?: string
          prazo_fatura?: string | null
          prazo_final?: string | null
          prazo_inicial?: string | null
          prazo_pgto?: string | null
          quality?: string | null
          solicitante?: string | null
          status?: string
          t_aflac?: string | null
          t_aflas?: string | null
          t_don?: string | null
          t_gmoc?: string | null
          t_gmos?: string | null
          telefone?: string | null
          tipo_modelo?: string
          tn?: string | null
          updated_at?: string
          whatsapp_contato?: string | null
        }
        Update: {
          add_claf?: string | null
          add_sup?: string | null
          arquivo_drive_id?: string | null
          arquivo_drive_nome?: string | null
          aud?: string | null
          cad?: string | null
          campos?: Json
          cargo?: string | null
          cif?: string | null
          cliente?: string
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          data_aceite_proposta?: string | null
          data_proposta?: string | null
          email?: string | null
          email_contato?: string | null
          estados?: string | null
          fob?: string | null
          formato_ultima_geracao?: string | null
          gerada_em?: string | null
          id?: string
          intacta?: string | null
          lacrar?: string | null
          link_contrato?: string | null
          link_proposta?: string | null
          m_12h?: string | null
          m_8h?: string | null
          modelo_doc_id?: string
          nome_contato?: string | null
          numero?: string
          observacao?: string | null
          pasta_destino_id?: string
          prazo_fatura?: string | null
          prazo_final?: string | null
          prazo_inicial?: string | null
          prazo_pgto?: string | null
          quality?: string | null
          solicitante?: string | null
          status?: string
          t_aflac?: string | null
          t_aflas?: string | null
          t_don?: string | null
          t_gmoc?: string | null
          t_gmos?: string | null
          telefone?: string | null
          tipo_modelo?: string
          tn?: string | null
          updated_at?: string
          whatsapp_contato?: string | null
        }
        Relationships: []
      }
      propostas_gestores_regionais: {
        Row: {
          ativo: boolean
          contato: string
          created_at: string
          id: string
          ordem: number
          regional: string
          supervisor: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          contato: string
          created_at?: string
          id?: string
          ordem?: number
          regional: string
          supervisor: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          contato?: string
          created_at?: string
          id?: string
          ordem?: number
          regional?: string
          supervisor?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      relatorio_resultado_diario: {
        Row: {
          cadencia: number | null
          cargas: number | null
          cliente_final: string | null
          cliente_nacional: string | null
          cliente_regional: string | null
          contrato: string | null
          coordenacao: string | null
          created_at: string
          data: string | null
          destino: string | null
          embarcado: number | null
          file_name: string | null
          funcionario: string | null
          id: string
          importacao_id: string | null
          local_embarque: string | null
          motivo_nhe: string | null
          observacoes: string | null
          observacoes_nhe: string | null
          os: string | null
          produto: string | null
          remanescente: number | null
          situacao: string | null
          supervisao: string | null
          toneladas: number | null
          tons_cadencia: number | null
          total_afla: number | null
          total_embarcado_mais_teste: number | null
          total_falling_number: number | null
          total_gmo: number | null
          total_intacta: number | null
          total_vomitoxina: number | null
          valor_afla: number | null
          valor_embarcado: number | null
          valor_falling_number: number | null
          valor_gmo: number | null
          valor_intacta: number | null
          valor_ton: number | null
          valor_vomitoxina: number | null
        }
        Insert: {
          cadencia?: number | null
          cargas?: number | null
          cliente_final?: string | null
          cliente_nacional?: string | null
          cliente_regional?: string | null
          contrato?: string | null
          coordenacao?: string | null
          created_at?: string
          data?: string | null
          destino?: string | null
          embarcado?: number | null
          file_name?: string | null
          funcionario?: string | null
          id?: string
          importacao_id?: string | null
          local_embarque?: string | null
          motivo_nhe?: string | null
          observacoes?: string | null
          observacoes_nhe?: string | null
          os?: string | null
          produto?: string | null
          remanescente?: number | null
          situacao?: string | null
          supervisao?: string | null
          toneladas?: number | null
          tons_cadencia?: number | null
          total_afla?: number | null
          total_embarcado_mais_teste?: number | null
          total_falling_number?: number | null
          total_gmo?: number | null
          total_intacta?: number | null
          total_vomitoxina?: number | null
          valor_afla?: number | null
          valor_embarcado?: number | null
          valor_falling_number?: number | null
          valor_gmo?: number | null
          valor_intacta?: number | null
          valor_ton?: number | null
          valor_vomitoxina?: number | null
        }
        Update: {
          cadencia?: number | null
          cargas?: number | null
          cliente_final?: string | null
          cliente_nacional?: string | null
          cliente_regional?: string | null
          contrato?: string | null
          coordenacao?: string | null
          created_at?: string
          data?: string | null
          destino?: string | null
          embarcado?: number | null
          file_name?: string | null
          funcionario?: string | null
          id?: string
          importacao_id?: string | null
          local_embarque?: string | null
          motivo_nhe?: string | null
          observacoes?: string | null
          observacoes_nhe?: string | null
          os?: string | null
          produto?: string | null
          remanescente?: number | null
          situacao?: string | null
          supervisao?: string | null
          toneladas?: number | null
          tons_cadencia?: number | null
          total_afla?: number | null
          total_embarcado_mais_teste?: number | null
          total_falling_number?: number | null
          total_gmo?: number | null
          total_intacta?: number | null
          total_vomitoxina?: number | null
          valor_afla?: number | null
          valor_embarcado?: number | null
          valor_falling_number?: number | null
          valor_gmo?: number | null
          valor_intacta?: number | null
          valor_ton?: number | null
          valor_vomitoxina?: number | null
        }
        Relationships: []
      }
      relatorio_resultado_diario_staging: {
        Row: {
          cadencia: number | null
          cargas: number | null
          cliente_final: string | null
          cliente_nacional: string | null
          cliente_regional: string | null
          contrato: string | null
          coordenacao: string | null
          created_at: string
          data: string | null
          destino: string | null
          embarcado: number | null
          file_name: string | null
          funcionario: string | null
          id: string
          importacao_id: string | null
          local_embarque: string | null
          motivo_nhe: string | null
          observacoes: string | null
          observacoes_nhe: string | null
          os: string | null
          produto: string | null
          remanescente: number | null
          situacao: string | null
          supervisao: string | null
          toneladas: number | null
          tons_cadencia: number | null
          total_afla: number | null
          total_embarcado_mais_teste: number | null
          total_falling_number: number | null
          total_gmo: number | null
          total_intacta: number | null
          total_vomitoxina: number | null
          valor_afla: number | null
          valor_embarcado: number | null
          valor_falling_number: number | null
          valor_gmo: number | null
          valor_intacta: number | null
          valor_ton: number | null
          valor_vomitoxina: number | null
        }
        Insert: {
          cadencia?: number | null
          cargas?: number | null
          cliente_final?: string | null
          cliente_nacional?: string | null
          cliente_regional?: string | null
          contrato?: string | null
          coordenacao?: string | null
          created_at?: string
          data?: string | null
          destino?: string | null
          embarcado?: number | null
          file_name?: string | null
          funcionario?: string | null
          id?: string
          importacao_id?: string | null
          local_embarque?: string | null
          motivo_nhe?: string | null
          observacoes?: string | null
          observacoes_nhe?: string | null
          os?: string | null
          produto?: string | null
          remanescente?: number | null
          situacao?: string | null
          supervisao?: string | null
          toneladas?: number | null
          tons_cadencia?: number | null
          total_afla?: number | null
          total_embarcado_mais_teste?: number | null
          total_falling_number?: number | null
          total_gmo?: number | null
          total_intacta?: number | null
          total_vomitoxina?: number | null
          valor_afla?: number | null
          valor_embarcado?: number | null
          valor_falling_number?: number | null
          valor_gmo?: number | null
          valor_intacta?: number | null
          valor_ton?: number | null
          valor_vomitoxina?: number | null
        }
        Update: {
          cadencia?: number | null
          cargas?: number | null
          cliente_final?: string | null
          cliente_nacional?: string | null
          cliente_regional?: string | null
          contrato?: string | null
          coordenacao?: string | null
          created_at?: string
          data?: string | null
          destino?: string | null
          embarcado?: number | null
          file_name?: string | null
          funcionario?: string | null
          id?: string
          importacao_id?: string | null
          local_embarque?: string | null
          motivo_nhe?: string | null
          observacoes?: string | null
          observacoes_nhe?: string | null
          os?: string | null
          produto?: string | null
          remanescente?: number | null
          situacao?: string | null
          supervisao?: string | null
          toneladas?: number | null
          tons_cadencia?: number | null
          total_afla?: number | null
          total_embarcado_mais_teste?: number | null
          total_falling_number?: number | null
          total_gmo?: number | null
          total_intacta?: number | null
          total_vomitoxina?: number | null
          valor_afla?: number | null
          valor_embarcado?: number | null
          valor_falling_number?: number | null
          valor_gmo?: number | null
          valor_intacta?: number | null
          valor_ton?: number | null
          valor_vomitoxina?: number | null
        }
        Relationships: []
      }
      relatorio_resultado_gavilon: {
        Row: {
          cadencia_tons_dia: number | null
          classif_utilizados: number | null
          classificador: string | null
          cliente: string | null
          created_at: string
          data: string | null
          fazenda_armazem: string | null
          file_name: string | null
          id: string
          importacao_id: string | null
          numero_veiculos: number | null
          ocorrencia: string | null
          ocorrencia_gavilon: string | null
          os: string | null
          produto: string | null
          regiao: string | null
          teste: number | null
          teste_aflatoxina: string | null
          tons_classificadas_d1: number | null
          total_cadencia: number | null
          total_embarcado: number | null
          total_embarcado_mais_teste: number | null
          valor_teste: number | null
          valor_tons: number | null
          valor_total_embarcado: number | null
        }
        Insert: {
          cadencia_tons_dia?: number | null
          classif_utilizados?: number | null
          classificador?: string | null
          cliente?: string | null
          created_at?: string
          data?: string | null
          fazenda_armazem?: string | null
          file_name?: string | null
          id?: string
          importacao_id?: string | null
          numero_veiculos?: number | null
          ocorrencia?: string | null
          ocorrencia_gavilon?: string | null
          os?: string | null
          produto?: string | null
          regiao?: string | null
          teste?: number | null
          teste_aflatoxina?: string | null
          tons_classificadas_d1?: number | null
          total_cadencia?: number | null
          total_embarcado?: number | null
          total_embarcado_mais_teste?: number | null
          valor_teste?: number | null
          valor_tons?: number | null
          valor_total_embarcado?: number | null
        }
        Update: {
          cadencia_tons_dia?: number | null
          classif_utilizados?: number | null
          classificador?: string | null
          cliente?: string | null
          created_at?: string
          data?: string | null
          fazenda_armazem?: string | null
          file_name?: string | null
          id?: string
          importacao_id?: string | null
          numero_veiculos?: number | null
          ocorrencia?: string | null
          ocorrencia_gavilon?: string | null
          os?: string | null
          produto?: string | null
          regiao?: string | null
          teste?: number | null
          teste_aflatoxina?: string | null
          tons_classificadas_d1?: number | null
          total_cadencia?: number | null
          total_embarcado?: number | null
          total_embarcado_mais_teste?: number | null
          valor_teste?: number | null
          valor_tons?: number | null
          valor_total_embarcado?: number | null
        }
        Relationships: []
      }
      relatorios_importacoes: {
        Row: {
          arquivo_nome_original: string
          arquivo_nome_storage: string | null
          created_at: string
          fingerprint: string | null
          id: string
          importado_por: string | null
          importado_por_nome: string | null
          mime_type: string | null
          modo_importacao: string
          nome_arquivo: string
          observacoes: string | null
          path: string
          periodo_fim: string | null
          periodo_inicio: string | null
          status: string
          storage_bucket: string
          storage_path: string
          substitui_importacoes: Json
          tamanho_bytes: number | null
          tipo: string
          tipo_relatorio: string
          titulo_relatorio: string
          total_periodo_registros: number | null
          updated_at: string
          url: string | null
          usuario_email: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          arquivo_nome_original: string
          arquivo_nome_storage?: string | null
          created_at?: string
          fingerprint?: string | null
          id?: string
          importado_por?: string | null
          importado_por_nome?: string | null
          mime_type?: string | null
          modo_importacao?: string
          nome_arquivo: string
          observacoes?: string | null
          path: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          storage_bucket?: string
          storage_path: string
          substitui_importacoes?: Json
          tamanho_bytes?: number | null
          tipo?: string
          tipo_relatorio: string
          titulo_relatorio: string
          total_periodo_registros?: number | null
          updated_at?: string
          url?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          arquivo_nome_original?: string
          arquivo_nome_storage?: string | null
          created_at?: string
          fingerprint?: string | null
          id?: string
          importado_por?: string | null
          importado_por_nome?: string | null
          mime_type?: string | null
          modo_importacao?: string
          nome_arquivo?: string
          observacoes?: string | null
          path?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          substitui_importacoes?: Json
          tamanho_bytes?: number | null
          tipo?: string
          tipo_relatorio?: string
          titulo_relatorio?: string
          total_periodo_registros?: number | null
          updated_at?: string
          url?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      rh_admissao_checklist: {
        Row: {
          colaborador_id: string
          colaborador_nome: string | null
          concluido_em: string | null
          cpf: string | null
          created_at: string
          etapa: string
          id: string
          observacao: string | null
          responsavel: string | null
          status: string
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          colaborador_nome?: string | null
          concluido_em?: string | null
          cpf?: string | null
          created_at?: string
          etapa: string
          id?: string
          observacao?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          colaborador_nome?: string | null
          concluido_em?: string | null
          cpf?: string | null
          created_at?: string
          etapa?: string
          id?: string
          observacao?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_admissoes: {
        Row: {
          cargo: string | null
          colaborador_id: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          data_admissao_prevista: string | null
          data_nascimento: string | null
          email: string | null
          empresa: string | null
          id: string
          nome: string
          observacoes: string | null
          status: string
          supervisao: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          colaborador_id?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao_prevista?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          supervisao?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          colaborador_id?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao_prevista?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          supervisao?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_admissoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_admissoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_admissoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_advertencias: {
        Row: {
          anexo_url: string | null
          aplicada_por: string | null
          colaborador_id: string | null
          colaborador_nome: string
          created_at: string
          created_by: string | null
          data: string
          descricao: string | null
          id: string
          motivo: string
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          anexo_url?: string | null
          aplicada_por?: string | null
          colaborador_id?: string | null
          colaborador_nome: string
          created_at?: string
          created_by?: string | null
          data: string
          descricao?: string | null
          id?: string
          motivo: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          anexo_url?: string | null
          aplicada_por?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string | null
          id?: string
          motivo?: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_advertencias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_advertencias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_advertencias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ajuda_custo: {
        Row: {
          colaborador_cpf: string
          colaborador_id: string | null
          colaborador_nome: string
          competencia: string
          conta: string
          created_at: string
          created_by: string | null
          descricao: string
          id: string
          lote_id: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          colaborador_cpf: string
          colaborador_id?: string | null
          colaborador_nome: string
          competencia: string
          conta: string
          created_at?: string
          created_by?: string | null
          descricao: string
          id?: string
          lote_id?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          colaborador_cpf?: string
          colaborador_id?: string | null
          colaborador_nome?: string
          competencia?: string
          conta?: string
          created_at?: string
          created_by?: string | null
          descricao?: string
          id?: string
          lote_id?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_ajuda_custo_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ajuda_custo_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ajuda_custo_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ajuda_custo_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "rh_ajuda_custo_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ajuda_custo_lotes: {
        Row: {
          competencia: string
          gerado_em: string
          gerado_por: string | null
          gerado_por_nome: string | null
          id: string
          linhas_flash: number
          linhas_ifood: number
          numero: number
          total_linhas: number
          total_valor: number
        }
        Insert: {
          competencia: string
          gerado_em?: string
          gerado_por?: string | null
          gerado_por_nome?: string | null
          id?: string
          linhas_flash?: number
          linhas_ifood?: number
          numero: number
          total_linhas?: number
          total_valor?: number
        }
        Update: {
          competencia?: string
          gerado_em?: string
          gerado_por?: string | null
          gerado_por_nome?: string | null
          id?: string
          linhas_flash?: number
          linhas_ifood?: number
          numero?: number
          total_linhas?: number
          total_valor?: number
        }
        Relationships: []
      }
      rh_atestados: {
        Row: {
          anexo_url: string | null
          cid: string | null
          colaborador_id: string | null
          colaborador_nome: string
          created_at: string
          created_by: string | null
          data_fim: string
          data_inicio: string
          dias: number | null
          id: string
          medico: string | null
          motivo_recusa: string | null
          observacoes: string | null
          periodo: string
          recusado_por: string | null
          status: string
          updated_at: string
        }
        Insert: {
          anexo_url?: string | null
          cid?: string | null
          colaborador_id?: string | null
          colaborador_nome: string
          created_at?: string
          created_by?: string | null
          data_fim: string
          data_inicio: string
          dias?: number | null
          id?: string
          medico?: string | null
          motivo_recusa?: string | null
          observacoes?: string | null
          periodo?: string
          recusado_por?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          anexo_url?: string | null
          cid?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          dias?: number | null
          id?: string
          medico?: string | null
          motivo_recusa?: string | null
          observacoes?: string | null
          periodo?: string
          recusado_por?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_atestados_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_atestados_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_atestados_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_cartao_ponto: {
        Row: {
          colaborador_id: string | null
          colaborador_nome: string
          created_at: string
          created_by: string | null
          data: string
          entrada: string | null
          horas_trabalhadas: number | null
          id: string
          observacoes: string | null
          retorno_almoco: string | null
          saida: string | null
          saida_almoco: string | null
          updated_at: string
        }
        Insert: {
          colaborador_id?: string | null
          colaborador_nome: string
          created_at?: string
          created_by?: string | null
          data: string
          entrada?: string | null
          horas_trabalhadas?: number | null
          id?: string
          observacoes?: string | null
          retorno_almoco?: string | null
          saida?: string | null
          saida_almoco?: string | null
          updated_at?: string
        }
        Update: {
          colaborador_id?: string | null
          colaborador_nome?: string
          created_at?: string
          created_by?: string | null
          data?: string
          entrada?: string | null
          horas_trabalhadas?: number | null
          id?: string
          observacoes?: string | null
          retorno_almoco?: string | null
          saida?: string | null
          saida_almoco?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_cartao_ponto_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_cartao_ponto_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_cartao_ponto_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_cat: {
        Row: {
          afastamento_dias: number | null
          anexo_url: string | null
          cid: string | null
          colaborador_id: string | null
          colaborador_nome: string
          created_at: string
          created_by: string | null
          data_acidente: string
          descricao: string | null
          id: string
          protocolo: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          afastamento_dias?: number | null
          anexo_url?: string | null
          cid?: string | null
          colaborador_id?: string | null
          colaborador_nome: string
          created_at?: string
          created_by?: string | null
          data_acidente: string
          descricao?: string | null
          id?: string
          protocolo?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          afastamento_dias?: number | null
          anexo_url?: string | null
          cid?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string
          created_at?: string
          created_by?: string | null
          data_acidente?: string
          descricao?: string | null
          id?: string
          protocolo?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_cat_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_cat_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_cat_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_clinicas_sst: {
        Row: {
          ativo: boolean
          celular: string | null
          cep: string | null
          chave_pix: string | null
          cidade: string | null
          created_at: string
          dados_medico: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          exames: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          celular?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          created_at?: string
          dados_medico?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          exames?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          celular?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          created_at?: string
          dados_medico?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          exames?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rh_contas_pagamento: {
        Row: {
          agencia: string | null
          anexo_url: string | null
          ativo: boolean
          banco: string | null
          chave_pix: string | null
          colaborador_cpf: string | null
          colaborador_id: string | null
          colaborador_nome: string
          conta: string | null
          created_at: string
          created_by: string | null
          id: string
          observacoes: string | null
          tipo: string
          tipo_conta: string | null
          titular_documento: string
          titular_nome: string
          updated_at: string
          vinculo: string | null
        }
        Insert: {
          agencia?: string | null
          anexo_url?: string | null
          ativo?: boolean
          banco?: string | null
          chave_pix?: string | null
          colaborador_cpf?: string | null
          colaborador_id?: string | null
          colaborador_nome: string
          conta?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          observacoes?: string | null
          tipo: string
          tipo_conta?: string | null
          titular_documento: string
          titular_nome: string
          updated_at?: string
          vinculo?: string | null
        }
        Update: {
          agencia?: string | null
          anexo_url?: string | null
          ativo?: boolean
          banco?: string | null
          chave_pix?: string | null
          colaborador_cpf?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string
          conta?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          observacoes?: string | null
          tipo?: string
          tipo_conta?: string | null
          titular_documento?: string
          titular_nome?: string
          updated_at?: string
          vinculo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_contas_pagamento_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_contas_pagamento_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_contas_pagamento_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_contratos: {
        Row: {
          arquivo_url: string | null
          assinado: boolean
          assinado_em: string | null
          colaborador_id: string
          colaborador_nome: string | null
          created_at: string
          criado_por: string | null
          id: string
          observacao: string | null
          status: string
          tipo: string
          updated_at: string
          vencimento: string | null
          versao: number
        }
        Insert: {
          arquivo_url?: string | null
          assinado?: boolean
          assinado_em?: string | null
          colaborador_id: string
          colaborador_nome?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          observacao?: string | null
          status?: string
          tipo: string
          updated_at?: string
          vencimento?: string | null
          versao?: number
        }
        Update: {
          arquivo_url?: string | null
          assinado?: boolean
          assinado_em?: string | null
          colaborador_id?: string
          colaborador_nome?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          observacao?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          vencimento?: string | null
          versao?: number
        }
        Relationships: []
      }
      rh_contratos_experiencia: {
        Row: {
          colaborador_id: string | null
          colaborador_nome: string
          created_at: string
          created_by: string | null
          data_efetivacao: string | null
          data_fim_experiencia: string
          data_fim_prorrogacao: string | null
          data_inicio: string
          id: string
          observacoes: string | null
          prorrogado: boolean
          status: string
          updated_at: string
        }
        Insert: {
          colaborador_id?: string | null
          colaborador_nome: string
          created_at?: string
          created_by?: string | null
          data_efetivacao?: string | null
          data_fim_experiencia: string
          data_fim_prorrogacao?: string | null
          data_inicio: string
          id?: string
          observacoes?: string | null
          prorrogado?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string | null
          colaborador_nome?: string
          created_at?: string
          created_by?: string | null
          data_efetivacao?: string | null
          data_fim_experiencia?: string
          data_fim_prorrogacao?: string | null
          data_inicio?: string
          id?: string
          observacoes?: string | null
          prorrogado?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_contratos_experiencia_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_contratos_experiencia_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_contratos_experiencia_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_documentos_registro: {
        Row: {
          admissao_id: string
          arquivo_url: string | null
          created_at: string
          id: string
          observacoes: string | null
          status: string
          tipo_documento: string
          updated_at: string
        }
        Insert: {
          admissao_id: string
          arquivo_url?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          status?: string
          tipo_documento: string
          updated_at?: string
        }
        Update: {
          admissao_id?: string
          arquivo_url?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          status?: string
          tipo_documento?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_documentos_registro_admissao_id_fkey"
            columns: ["admissao_id"]
            isOneToOne: false
            referencedRelation: "rh_admissoes"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_empresas: {
        Row: {
          aliases: string[]
          ativo: boolean
          cnpj: string
          created_at: string
          endereco: string
          id: string
          razao_social: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          ativo?: boolean
          cnpj: string
          created_at?: string
          endereco: string
          id?: string
          razao_social: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          ativo?: boolean
          cnpj?: string
          created_at?: string
          endereco?: string
          id?: string
          razao_social?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_epi: {
        Row: {
          assinatura_url: string | null
          ca: string | null
          colaborador_id: string
          colaborador_nome: string | null
          created_at: string
          criado_por: string | null
          devolucao: string | null
          entrega: string | null
          equipamento: string
          id: string
          observacao: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assinatura_url?: string | null
          ca?: string | null
          colaborador_id: string
          colaborador_nome?: string | null
          created_at?: string
          criado_por?: string | null
          devolucao?: string | null
          entrega?: string | null
          equipamento: string
          id?: string
          observacao?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assinatura_url?: string | null
          ca?: string | null
          colaborador_id?: string
          colaborador_nome?: string | null
          created_at?: string
          criado_por?: string | null
          devolucao?: string | null
          entrega?: string | null
          equipamento?: string
          id?: string
          observacao?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_epi_registros: {
        Row: {
          anexo_url: string | null
          ca: string | null
          colaborador_id: string | null
          colaborador_nome: string
          compra_item_id: string | null
          confirmado_em: string | null
          created_at: string
          data_entrega: string | null
          epi: string
          id: string
          observacao: string | null
          quantidade: number
          regional: string | null
          status: string
          tamanho: string | null
        }
        Insert: {
          anexo_url?: string | null
          ca?: string | null
          colaborador_id?: string | null
          colaborador_nome: string
          compra_item_id?: string | null
          confirmado_em?: string | null
          created_at?: string
          data_entrega?: string | null
          epi: string
          id?: string
          observacao?: string | null
          quantidade?: number
          regional?: string | null
          status?: string
          tamanho?: string | null
        }
        Update: {
          anexo_url?: string | null
          ca?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string
          compra_item_id?: string | null
          confirmado_em?: string | null
          created_at?: string
          data_entrega?: string | null
          epi?: string
          id?: string
          observacao?: string | null
          quantidade?: number
          regional?: string | null
          status?: string
          tamanho?: string | null
        }
        Relationships: []
      }
      rh_exames: {
        Row: {
          anexo_url: string | null
          clinica_id: string | null
          clinica_nome: string | null
          colaborador_id: string | null
          colaborador_nome: string
          created_at: string
          created_by: string | null
          data_agendada: string | null
          data_realizada: string | null
          data_vencimento: string | null
          id: string
          observacoes: string | null
          resultado: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          anexo_url?: string | null
          clinica_id?: string | null
          clinica_nome?: string | null
          colaborador_id?: string | null
          colaborador_nome: string
          created_at?: string
          created_by?: string | null
          data_agendada?: string | null
          data_realizada?: string | null
          data_vencimento?: string | null
          id?: string
          observacoes?: string | null
          resultado?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          anexo_url?: string | null
          clinica_id?: string | null
          clinica_nome?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string
          created_at?: string
          created_by?: string | null
          data_agendada?: string | null
          data_realizada?: string | null
          data_vencimento?: string | null
          id?: string
          observacoes?: string | null
          resultado?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_exames_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "rh_clinicas_sst"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_exames_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_exames_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_exames_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ferias: {
        Row: {
          colaborador_id: string | null
          colaborador_nome: string
          created_at: string
          created_by: string | null
          data_fim: string
          data_inicio: string
          dias_direito: number
          dias_gozados: number | null
          escala_autorizado_por: string | null
          escala_liberada_em: string | null
          escala_liberada_por: string | null
          escala_motivo: string | null
          id: string
          observacoes: string | null
          periodo_aquisitivo_fim: string | null
          periodo_aquisitivo_inicio: string | null
          periodo_concessivo_limite: string | null
          permite_escala: boolean
          status: string
          updated_at: string
        }
        Insert: {
          colaborador_id?: string | null
          colaborador_nome: string
          created_at?: string
          created_by?: string | null
          data_fim: string
          data_inicio: string
          dias_direito?: number
          dias_gozados?: number | null
          escala_autorizado_por?: string | null
          escala_liberada_em?: string | null
          escala_liberada_por?: string | null
          escala_motivo?: string | null
          id?: string
          observacoes?: string | null
          periodo_aquisitivo_fim?: string | null
          periodo_aquisitivo_inicio?: string | null
          periodo_concessivo_limite?: string | null
          permite_escala?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string | null
          colaborador_nome?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          dias_direito?: number
          dias_gozados?: number | null
          escala_autorizado_por?: string | null
          escala_liberada_em?: string | null
          escala_liberada_por?: string | null
          escala_motivo?: string | null
          id?: string
          observacoes?: string | null
          periodo_aquisitivo_fim?: string | null
          periodo_aquisitivo_inicio?: string | null
          periodo_concessivo_limite?: string | null
          permite_escala?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_ferias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ferias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ferias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_folha: {
        Row: {
          arquivo_url: string | null
          colaborador_id: string | null
          colaborador_nome: string | null
          competencia: string | null
          created_at: string
          created_by: string | null
          descontos: Json
          empresa: string | null
          id: string
          proventos: Json
          status: string
          updated_at: string
          valor_bruto: number | null
          valor_liquido: number | null
        }
        Insert: {
          arquivo_url?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          descontos?: Json
          empresa?: string | null
          id?: string
          proventos?: Json
          status?: string
          updated_at?: string
          valor_bruto?: number | null
          valor_liquido?: number | null
        }
        Update: {
          arquivo_url?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          descontos?: Json
          empresa?: string | null
          id?: string
          proventos?: Json
          status?: string
          updated_at?: string
          valor_bruto?: number | null
          valor_liquido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_folha_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_folha_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_folha_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_integracao: {
        Row: {
          admissao_id: string | null
          colaborador_id: string | null
          colaborador_nome: string
          created_at: string
          data_conclusao: string | null
          data_inicio: string | null
          etapas: Json
          id: string
          observacoes: string | null
          responsavel: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admissao_id?: string | null
          colaborador_id?: string | null
          colaborador_nome: string
          created_at?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          etapas?: Json
          id?: string
          observacoes?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admissao_id?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string
          created_at?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          etapas?: Json
          id?: string
          observacoes?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_integracao_admissao_id_fkey"
            columns: ["admissao_id"]
            isOneToOne: false
            referencedRelation: "rh_admissoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_integracao_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_integracao_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_integracao_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_plantao_contatos: {
        Row: {
          atualizado_por: string | null
          colaborador_key: string
          cpf: string | null
          created_at: string
          email_corporativo: string | null
          id: string
          nome: string
          origem: string
          setor_preferencial: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          atualizado_por?: string | null
          colaborador_key: string
          cpf?: string | null
          created_at?: string
          email_corporativo?: string | null
          id?: string
          nome: string
          origem?: string
          setor_preferencial?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          atualizado_por?: string | null
          colaborador_key?: string
          cpf?: string | null
          created_at?: string
          email_corporativo?: string | null
          id?: string
          nome?: string
          origem?: string
          setor_preferencial?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rh_plantao_escalas: {
        Row: {
          apelido: string | null
          colaborador_key: string
          cpf: string | null
          created_at: string
          created_by: string | null
          data_plantao: string
          email_corporativo: string | null
          evento: string | null
          hora_fim: string | null
          hora_fim_2: string | null
          hora_inicio: string | null
          hora_inicio_2: string | null
          id: string
          nome: string
          observacoes: string | null
          ordem: number
          setor: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          colaborador_key: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_plantao: string
          email_corporativo?: string | null
          evento?: string | null
          hora_fim?: string | null
          hora_fim_2?: string | null
          hora_inicio?: string | null
          hora_inicio_2?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          ordem?: number
          setor: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          colaborador_key?: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_plantao?: string
          email_corporativo?: string | null
          evento?: string | null
          hora_fim?: string | null
          hora_fim_2?: string | null
          hora_inicio?: string | null
          hora_inicio_2?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          ordem?: number
          setor?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rh_plantao_modelos: {
        Row: {
          apelido: string | null
          colaborador_key: string
          cpf: string | null
          created_at: string
          created_by: string | null
          dias_semana: number[]
          email_corporativo: string | null
          hora_fim: string | null
          hora_fim_2: string | null
          hora_inicio: string | null
          hora_inicio_2: string | null
          id: string
          nome: string
          nome_modelo: string
          ordem: number
          setor: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          colaborador_key: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          dias_semana?: number[]
          email_corporativo?: string | null
          hora_fim?: string | null
          hora_fim_2?: string | null
          hora_inicio?: string | null
          hora_inicio_2?: string | null
          id?: string
          nome: string
          nome_modelo?: string
          ordem?: number
          setor: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          colaborador_key?: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          dias_semana?: number[]
          email_corporativo?: string | null
          hora_fim?: string | null
          hora_fim_2?: string | null
          hora_inicio?: string | null
          hora_inicio_2?: string | null
          id?: string
          nome?: string
          nome_modelo?: string
          ordem?: number
          setor?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rh_plantao_setor_config: {
        Row: {
          ativo: boolean
          created_at: string
          hora_fim: string
          hora_fim_2: string | null
          hora_inicio: string
          hora_inicio_2: string | null
          setor: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          hora_fim?: string
          hora_fim_2?: string | null
          hora_inicio?: string
          hora_inicio_2?: string | null
          setor: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          hora_fim?: string
          hora_fim_2?: string | null
          hora_inicio?: string
          hora_inicio_2?: string | null
          setor?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_plantao_setor_editores: {
        Row: {
          app_usuario_id: string
          created_at: string
          created_by: string | null
          id: string
          setor: string
        }
        Insert: {
          app_usuario_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          setor: string
        }
        Update: {
          app_usuario_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          setor?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_plantao_setor_editores_app_usuario_id_fkey"
            columns: ["app_usuario_id"]
            isOneToOne: false
            referencedRelation: "app_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plantao_setor_editores_app_usuario_id_fkey"
            columns: ["app_usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_contexto_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "rh_plantao_setor_editores_app_usuario_id_fkey"
            columns: ["app_usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_usuario_modulos"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "rh_plantao_setor_editores_setor_fkey"
            columns: ["setor"]
            isOneToOne: false
            referencedRelation: "rh_plantao_setor_config"
            referencedColumns: ["setor"]
          },
        ]
      }
      rh_plantao_setores: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      rh_rescisoes: {
        Row: {
          colaborador_id: string | null
          colaborador_nome: string
          created_at: string
          created_by: string | null
          data_desligamento: string
          documentos_url: string | null
          id: string
          motivo: string | null
          observacoes: string | null
          status: string
          tipo: string
          updated_at: string
          valor_total: number | null
        }
        Insert: {
          colaborador_id?: string | null
          colaborador_nome: string
          created_at?: string
          created_by?: string | null
          data_desligamento: string
          documentos_url?: string | null
          id?: string
          motivo?: string | null
          observacoes?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_total?: number | null
        }
        Update: {
          colaborador_id?: string | null
          colaborador_nome?: string
          created_at?: string
          created_by?: string | null
          data_desligamento?: string
          documentos_url?: string | null
          id?: string
          motivo?: string | null
          observacoes?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_rescisoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_rescisoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_rescisoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_treinamento_acessos: {
        Row: {
          acessado_em: string
          colaborador_nome: string | null
          concluido: boolean
          concluido_em: string | null
          cpf: string
          dispositivo: string | null
          id: string
          material: string | null
          progresso: number
          tipo_material: string | null
        }
        Insert: {
          acessado_em?: string
          colaborador_nome?: string | null
          concluido?: boolean
          concluido_em?: string | null
          cpf: string
          dispositivo?: string | null
          id?: string
          material?: string | null
          progresso?: number
          tipo_material?: string | null
        }
        Update: {
          acessado_em?: string
          colaborador_nome?: string | null
          concluido?: boolean
          concluido_em?: string | null
          cpf?: string
          dispositivo?: string | null
          id?: string
          material?: string | null
          progresso?: number
          tipo_material?: string | null
        }
        Relationships: []
      }
      supervisoes: {
        Row: {
          ativo: boolean
          created_at: string
          distribuicao_os_automatica: boolean
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          distribuicao_os_automatica?: boolean
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          distribuicao_os_automatica?: boolean
          id?: string
          nome?: string
        }
        Relationships: []
      }
      termos_celular: {
        Row: {
          colaborador_id: string | null
          colaborador_nome: string | null
          compra_item_id: string | null
          confirmado_em: string | null
          created_at: string | null
          id: string
          metodo_pagamento: string | null
          observacao: string | null
          parcelas: number | null
          status: string
          termo_url: string | null
          valor: number | null
        }
        Insert: {
          colaborador_id?: string | null
          colaborador_nome?: string | null
          compra_item_id?: string | null
          confirmado_em?: string | null
          created_at?: string | null
          id?: string
          metodo_pagamento?: string | null
          observacao?: string | null
          parcelas?: number | null
          status?: string
          termo_url?: string | null
          valor?: number | null
        }
        Update: {
          colaborador_id?: string | null
          colaborador_nome?: string | null
          compra_item_id?: string | null
          confirmado_em?: string | null
          created_at?: string | null
          id?: string
          metodo_pagamento?: string | null
          observacao?: string | null
          parcelas?: number | null
          status?: string
          termo_url?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "termos_celular_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compras_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_documentos: {
        Row: {
          arquivo_url: string | null
          assinado: boolean
          assinado_em: string | null
          colaborador_id: string | null
          colaborador_nome: string | null
          created_at: string
          criado_por: string | null
          id: string
          observacao: string | null
          patrimonio_id: string | null
          status: string
          tipo: string
          updated_at: string
          validade: string | null
          versao: number
        }
        Insert: {
          arquivo_url?: string | null
          assinado?: boolean
          assinado_em?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          observacao?: string | null
          patrimonio_id?: string | null
          status?: string
          tipo: string
          updated_at?: string
          validade?: string | null
          versao?: number
        }
        Update: {
          arquivo_url?: string | null
          assinado?: boolean
          assinado_em?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          observacao?: string | null
          patrimonio_id?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          validade?: string | null
          versao?: number
        }
        Relationships: []
      }
      termos_veiculos: {
        Row: {
          assinado_em: string | null
          colaborador_id: string | null
          colaborador_nome: string | null
          created_at: string | null
          id: string
          observacao: string | null
          placa: string | null
          status: string
          termo_url: string | null
          veiculo: string | null
        }
        Insert: {
          assinado_em?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string | null
          id?: string
          observacao?: string | null
          placa?: string | null
          status?: string
          termo_url?: string | null
          veiculo?: string | null
        }
        Update: {
          assinado_em?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string | null
          id?: string
          observacao?: string | null
          placa?: string | null
          status?: string
          termo_url?: string | null
          veiculo?: string | null
        }
        Relationships: []
      }
      ti_integracao_logs: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json
          id: string
          integracao_id: string | null
          mensagem: string | null
          status: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json
          id?: string
          integracao_id?: string | null
          mensagem?: string | null
          status?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json
          id?: string
          integracao_id?: string | null
          mensagem?: string | null
          status?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ti_integracao_logs_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "ti_integracoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ti_integracao_segredos: {
        Row: {
          ativo: boolean
          atualizado_por: string | null
          chave: string
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          integracao_id: string
          metadata: Json
          sensivel: boolean
          updated_at: string
          valor: string
        }
        Insert: {
          ativo?: boolean
          atualizado_por?: string | null
          chave: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          integracao_id: string
          metadata?: Json
          sensivel?: boolean
          updated_at?: string
          valor: string
        }
        Update: {
          ativo?: boolean
          atualizado_por?: string | null
          chave?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          integracao_id?: string
          metadata?: Json
          sensivel?: boolean
          updated_at?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "ti_integracao_segredos_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "ti_integracoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ti_integracoes: {
        Row: {
          ambiente: string
          ativo: boolean
          atualizado_por: string | null
          auth_url: string | null
          base_url: string | null
          categoria: string
          codigo: string
          created_at: string
          criado_por: string | null
          id: string
          metadata: Json
          nome: string
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          ambiente?: string
          ativo?: boolean
          atualizado_por?: string | null
          auth_url?: string | null
          base_url?: string | null
          categoria?: string
          codigo: string
          created_at?: string
          criado_por?: string | null
          id?: string
          metadata?: Json
          nome: string
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          ambiente?: string
          ativo?: boolean
          atualizado_por?: string | null
          auth_url?: string | null
          base_url?: string | null
          categoria?: string
          codigo?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          metadata?: Json
          nome?: string
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      uber_colaboradores_adicao_fila: {
        Row: {
          arquivo_remoto: string | null
          cancelado_em: string | null
          colaborador_id: string
          created_at: string
          detectado_em: string
          email: string | null
          enviado_em: string | null
          fonte: string
          id: string
          nome: string
          status: string
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          arquivo_remoto?: string | null
          cancelado_em?: string | null
          colaborador_id: string
          created_at?: string
          detectado_em?: string
          email?: string | null
          enviado_em?: string | null
          fonte?: string
          id?: string
          nome: string
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          arquivo_remoto?: string | null
          cancelado_em?: string | null
          colaborador_id?: string
          created_at?: string
          detectado_em?: string
          email?: string | null
          enviado_em?: string | null
          fonte?: string
          id?: string
          nome?: string
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uber_colaboradores_adicao_fila_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_colaboradores_adicao_fila_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_colaboradores_adicao_fila_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_colaboradores_equipe_estado: {
        Row: {
          ativo_observado: boolean
          colaborador_id: string
          email: string | null
          inicializado_em: string
          nome: string
          ultima_mudanca_em: string
          updated_at: string
        }
        Insert: {
          ativo_observado: boolean
          colaborador_id: string
          email?: string | null
          inicializado_em?: string
          nome: string
          ultima_mudanca_em?: string
          updated_at?: string
        }
        Update: {
          ativo_observado?: boolean
          colaborador_id?: string
          email?: string | null
          inicializado_em?: string
          nome?: string
          ultima_mudanca_em?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uber_colaboradores_equipe_estado_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: true
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_colaboradores_equipe_estado_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: true
            referencedRelation: "colaboradores_atuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_colaboradores_equipe_estado_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: true
            referencedRelation: "vw_colaboradores_atuais"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_colaboradores_remocao_fila: {
        Row: {
          arquivo_remoto: string | null
          cancelado_em: string | null
          colaborador_id: string
          created_at: string
          detectado_em: string
          email: string | null
          enviado_em: string | null
          fonte: string | null
          id: string
          nome: string
          status: string
          status_historico_id: string | null
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          arquivo_remoto?: string | null
          cancelado_em?: string | null
          colaborador_id: string
          created_at?: string
          detectado_em?: string
          email?: string | null
          enviado_em?: string | null
          fonte?: string | null
          id?: string
          nome: string
          status?: string
          status_historico_id?: string | null
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          arquivo_remoto?: string | null
          cancelado_em?: string | null
          colaborador_id?: string
          created_at?: string
          detectado_em?: string
          email?: string | null
          enviado_em?: string | null
          fonte?: string | null
          id?: string
          nome?: string
          status?: string
          status_historico_id?: string | null
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uber_colaboradores_remocao_fila_status_historico_id_fkey"
            columns: ["status_historico_id"]
            isOneToOne: true
            referencedRelation: "colaboradores_status_historico"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_gorjeta_caixa_lancamentos: {
        Row: {
          colaborador_email: string | null
          colaborador_nome: string
          corrida_id: string | null
          created_at: string
          data_gorjeta: string
          descricao_grm: string
          external_id: string
          gorjeta_em: string | null
          grm_retorno: Json | null
          id: string
          iniciado_em: string | null
          processado_em: string | null
          solicitado_em: string
          status: string
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          colaborador_email?: string | null
          colaborador_nome: string
          corrida_id?: string | null
          created_at?: string
          data_gorjeta: string
          descricao_grm: string
          external_id: string
          gorjeta_em?: string | null
          grm_retorno?: Json | null
          id?: string
          iniciado_em?: string | null
          processado_em?: string | null
          solicitado_em?: string
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          colaborador_email?: string | null
          colaborador_nome?: string
          corrida_id?: string | null
          created_at?: string
          data_gorjeta?: string
          descricao_grm?: string
          external_id?: string
          gorjeta_em?: string | null
          grm_retorno?: Json | null
          id?: string
          iniciado_em?: string | null
          processado_em?: string | null
          solicitado_em?: string
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      uber_gps_fila: {
        Row: {
          corrida_id: string
          detalhe: string | null
          id: string
          incluir_destino: boolean
          iniciado_em: string | null
          motivo: string | null
          precisao: string | null
          processado_em: string | null
          provedor: string | null
          resultado: Json | null
          solicitado_em: string
          solicitado_por: string | null
          status: string
          tentativas: number
          updated_at: string
        }
        Insert: {
          corrida_id: string
          detalhe?: string | null
          id?: string
          incluir_destino?: boolean
          iniciado_em?: string | null
          motivo?: string | null
          precisao?: string | null
          processado_em?: string | null
          provedor?: string | null
          resultado?: Json | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tentativas?: number
          updated_at?: string
        }
        Update: {
          corrida_id?: string
          detalhe?: string | null
          id?: string
          incluir_destino?: boolean
          iniciado_em?: string | null
          motivo?: string | null
          precisao?: string | null
          processado_em?: string | null
          provedor?: string | null
          resultado?: Json | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tentativas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uber_gps_fila_corrida_id_fkey"
            columns: ["corrida_id"]
            isOneToOne: true
            referencedRelation: "conferencia_uber_corridas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_gps_fila_corrida_id_fkey"
            columns: ["corrida_id"]
            isOneToOne: true
            referencedRelation: "vw_conferencia_uber_corridas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_modules: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          module_code: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          module_code: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          module_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_modules_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_modules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      central_alertas_operacionais: {
        Row: {
          avaliado: boolean | null
          cliente: string | null
          colaborador_key: string | null
          colaborador_nome: string | null
          coordenacao: string | null
          enviado_em: string | null
          id: string | null
          numero_os: string | null
          os_id: string | null
          revisado_em: string | null
          revisado_por: string | null
          revisado_por_nome: string | null
          supervisao: string | null
          suspeito: boolean | null
          tipo_alerta: string | null
        }
        Insert: {
          avaliado?: boolean | null
          cliente?: string | null
          colaborador_key?: string | null
          colaborador_nome?: string | null
          coordenacao?: string | null
          enviado_em?: string | null
          id?: string | null
          numero_os?: string | null
          os_id?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          revisado_por_nome?: string | null
          supervisao?: string | null
          suspeito?: boolean | null
          tipo_alerta?: never
        }
        Update: {
          avaliado?: boolean | null
          cliente?: string | null
          colaborador_key?: string | null
          colaborador_nome?: string | null
          coordenacao?: string | null
          enviado_em?: string | null
          id?: string | null
          numero_os?: string | null
          os_id?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          revisado_por_nome?: string | null
          supervisao?: string | null
          suspeito?: boolean | null
          tipo_alerta?: never
        }
        Relationships: [
          {
            foreignKeyName: "operacional_laudos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "operacional_os"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores_atuais: {
        Row: {
          admissao: string | null
          ativo: boolean | null
          bairro: string | null
          cargo: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          coordenacao: string | null
          cpf: string | null
          data_nascimento: string | null
          data_referencia: string | null
          desligamento: string | null
          email_empresa: string | null
          email_pessoal: string | null
          empresa: string | null
          endereco: string | null
          estado: string | null
          id: string | null
          nome: string | null
          sexo: string | null
          situacao: string | null
          supervisao: string | null
          tipo: string | null
          whatsapp: string | null
        }
        Insert: {
          admissao?: string | null
          ativo?: never
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          coordenacao?: string | null
          cpf?: never
          data_nascimento?: string | null
          data_referencia?: never
          desligamento?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string | null
          nome?: string | null
          sexo?: string | null
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          whatsapp?: string | null
        }
        Update: {
          admissao?: string | null
          ativo?: never
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          coordenacao?: string | null
          cpf?: never
          data_nascimento?: string | null
          data_referencia?: never
          desligamento?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string | null
          nome?: string | null
          sexo?: string | null
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      dashboard_socios_notas_emitidas_api: {
        Row: {
          cliente_nacional: string | null
          created_at: string | null
          dados_json: Json | null
          data_nota_real: string | null
          numero_nf: string | null
          valor_nota_real: number | null
          valor_total: number | null
        }
        Relationships: []
      }
      dashboard_socios_recebimentos_api: {
        Row: {
          cliente: string | null
          numero_nf: string | null
          recebimento: string | null
          valor_pago: number | null
        }
        Relationships: []
      }
      email_accounts_public: {
        Row: {
          ativo: boolean | null
          auto_encaminhar: boolean | null
          auto_responder: boolean | null
          conectada_em: string | null
          conexao_status: string | null
          created_at: string | null
          criado_por: string | null
          criado_por_nome: string | null
          email: string | null
          escopo: string | null
          id: string | null
          imap_host: string | null
          imap_port: number | null
          imap_secure: boolean | null
          limite_por_sync: number | null
          nome: string | null
          owner_auth_user_id: string | null
          pasta_entrada: string | null
          pasta_processados: string | null
          provider: string | null
          smtp_host: string | null
          smtp_port: number | null
          smtp_secure: boolean | null
          ultima_sync_em: string | null
          ultima_sync_erro: string | null
          ultima_sync_status: string | null
          ultima_uid: number | null
          ultima_verificacao_em: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          ativo?: boolean | null
          auto_encaminhar?: boolean | null
          auto_responder?: boolean | null
          conectada_em?: string | null
          conexao_status?: string | null
          created_at?: string | null
          criado_por?: string | null
          criado_por_nome?: string | null
          email?: string | null
          escopo?: string | null
          id?: string | null
          imap_host?: string | null
          imap_port?: number | null
          imap_secure?: boolean | null
          limite_por_sync?: number | null
          nome?: string | null
          owner_auth_user_id?: string | null
          pasta_entrada?: string | null
          pasta_processados?: string | null
          provider?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          ultima_sync_em?: string | null
          ultima_sync_erro?: string | null
          ultima_sync_status?: string | null
          ultima_uid?: number | null
          ultima_verificacao_em?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          ativo?: boolean | null
          auto_encaminhar?: boolean | null
          auto_responder?: boolean | null
          conectada_em?: string | null
          conexao_status?: string | null
          created_at?: string | null
          criado_por?: string | null
          criado_por_nome?: string | null
          email?: string | null
          escopo?: string | null
          id?: string | null
          imap_host?: string | null
          imap_port?: number | null
          imap_secure?: boolean | null
          limite_por_sync?: number | null
          nome?: string | null
          owner_auth_user_id?: string | null
          pasta_entrada?: string | null
          pasta_processados?: string | null
          provider?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          ultima_sync_em?: string | null
          ultima_sync_erro?: string | null
          ultima_sync_status?: string | null
          ultima_uid?: number | null
          ultima_verificacao_em?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      financeiro_fluxo_caixa_diario: {
        Row: {
          contas_pagar: number | null
          contas_receber: number | null
          data: string | null
          provisoes_dia: number | null
          saldo_dia: number | null
          saldo_projetado: number | null
          status: string | null
        }
        Relationships: []
      }
      financeiro_pagamentos_resumo: {
        Row: {
          aprovados_agendados: number | null
          pagos: number | null
          pendentes: number | null
          total_aberto: number | null
          total_pago: number | null
        }
        Relationships: []
      }
      frotas_fora_horario_lista: {
        Row: {
          atraso_retorno_min: number | null
          calculado_em: string | null
          caronas: Json | null
          chegada_casa: string | null
          condutor_escalado: string | null
          confianca: string | null
          coordenacao: string | null
          criterio: string | null
          data_evento: string | null
          dossie_id: string | null
          exc_gerados: number | null
          exc_notificados: number | null
          exc_pendentes: number | null
          excessos_fora: number | null
          fim_expediente: string | null
          fonte_expediente: string | null
          id: string | null
          inicio_expediente: string | null
          janela_fim: string | null
          janela_inicio: string | null
          km_00_05: number | null
          km_apos_chegada: number | null
          km_dia: number | null
          km_fora: number | null
          km_indevido: number | null
          km_noturno: number | null
          min_fora: number | null
          motivos: Json | null
          motorista: string | null
          placa: string | null
          qtd_excessos: number | null
          resumo_dia: Json | null
          retorno_previsto: string | null
          sem_ocorrencia: boolean | null
          status_caixa: string | null
          status_calculo: string | null
          status_notificacao: string | null
          supervisao: string | null
          tem_rota_caixa: boolean | null
          uso_sem_base: boolean | null
          valor_caixa: number | null
          valor_km: number | null
          vel_max: number | null
          veredito: string | null
          veredito_uso: string | null
          viagens_dia: number | null
          viagens_fora: number | null
          viagens_indevidas: number | null
        }
        Relationships: []
      }
      grm_sync_agent_architecture_v2: {
        Row: {
          agent_id: string | null
          current_lane: string | null
          depends_on: Json | null
          direction: string | null
          enabled: boolean | null
          interval_minutes: number | null
          legacy_lane: string | null
          legacy_lane_before_v2: string | null
          max_runtime_minutes: number | null
          mutex_group: string | null
          priority: number | null
          resource_class: string | null
          target_lane: string | null
          target_lane_label: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grm_sync_agent_settings_target_lane_fkey"
            columns: ["target_lane"]
            isOneToOne: false
            referencedRelation: "grm_sync_lanes"
            referencedColumns: ["lane"]
          },
        ]
      }
      grm_sync_cutover_readiness_v2: {
        Row: {
          active_version: number | null
          agents_without_target_lane: number | null
          cutover_at: string | null
          enabled_agents: number | null
          enabled_target_lanes: number | null
          max_heavy_concurrent: number | null
          max_workers: number | null
          min_free_memory_mb: number | null
          pending_jobs: number | null
          running_jobs: number | null
        }
        Insert: {
          active_version?: number | null
          agents_without_target_lane?: never
          cutover_at?: string | null
          enabled_agents?: never
          enabled_target_lanes?: never
          max_heavy_concurrent?: number | null
          max_workers?: number | null
          min_free_memory_mb?: number | null
          pending_jobs?: never
          running_jobs?: never
        }
        Update: {
          active_version?: number | null
          agents_without_target_lane?: never
          cutover_at?: string | null
          enabled_agents?: never
          enabled_target_lanes?: never
          max_heavy_concurrent?: number | null
          max_workers?: number | null
          min_free_memory_mb?: number | null
          pending_jobs?: never
          running_jobs?: never
        }
        Relationships: []
      }
      hospedagem_canceladas: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          cidade: string | null
          colaboradores: string | null
          data: string | null
          dias: number | null
          motivo_cancelamento: string | null
          solicitacao: string | null
          solicitacao_id: string | null
          solicitante: string | null
          supervisao: string | null
          uf: string | null
        }
        Relationships: []
      }
      hospedagem_dashboard_resumo: {
        Row: {
          checkouts_hoje: number | null
          checkouts_vencidos: number | null
          concluidas: number | null
          pendencias_financeiras: number | null
          pendencias_nf: number | null
          reservas_ativas: number | null
          solicitacoes_abertas: number | null
        }
        Relationships: []
      }
      hospedagem_documentos_pendentes_lancamento: {
        Row: {
          arquivo_url: string | null
          botconversa_destinatario: string | null
          botconversa_enviado_em: string | null
          cidade: string | null
          cliente: string | null
          codigo: string | null
          created_at: string | null
          criado_por: string | null
          external_message_id: string | null
          id: string | null
          mime_type: string | null
          nome_arquivo: string | null
          observacoes: string | null
          origem: string | null
          recebido_em: string | null
          reserva_id: string | null
          solicitacao_id: string | null
          status: string | null
          tipo: string | null
          uf: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      hospedagem_historico_atual_colaboradores: {
        Row: {
          aba_origem: string | null
          arquivo_origem: string | null
          cidade: string | null
          cliente: string | null
          colaborador: string | null
          created_at: string | null
          data: string | null
          hotel: string | null
          id: string | null
          linha_origem: number | null
          local_embarque: string | null
          localizacao: string | null
          nfs: string | null
          observacao: string | null
          raw: Json | null
          regional: string | null
          rn: number | null
          saldo: number | null
          situacao_pagamento: string | null
          status_hospedagem: string | null
          status_planilha: string | null
          tipo_quarto: string | null
          uf: string | null
          unique_hash: string | null
          updated_at: string | null
          valor_diaria: number | null
        }
        Relationships: []
      }
      hospedagem_minhas_solicitacoes: {
        Row: {
          checkout_hoje: boolean | null
          checkout_vencido: boolean | null
          cidade: string | null
          cliente: string | null
          codigo: string | null
          colaboradores: string | null
          coordenacao: string | null
          data_checkin: string | null
          data_checkin_prevista: string | null
          data_checkout: string | null
          data_checkout_prevista: string | null
          data_solicitacao: string | null
          empresa: string | null
          horario_chegada_previsto: string | null
          hotel: string | null
          local_embarque: string | null
          observacao_gestor: string | null
          preferencia_hospedagem: string | null
          quantidade_diarias_prevista: number | null
          solicitacao_id: string | null
          solicitante_id: string | null
          solicitante_nome: string | null
          status_hospedagem: string | null
          status_solicitacao: string | null
          supervisao: string | null
          total_colaboradores: number | null
          uf: string | null
        }
        Relationships: []
      }
      hospedagem_painel_geral: {
        Row: {
          checkout_hoje: boolean | null
          checkout_vencido: boolean | null
          cidade: string | null
          cliente: string | null
          codigo: string | null
          colaboradores: string | null
          comprovante_pagamento_url: string | null
          coordenacao: string | null
          data_checkin: string | null
          data_checkin_prevista: string | null
          data_checkout: string | null
          data_checkout_prevista: string | null
          data_pagamento: string | null
          data_solicitacao: string | null
          data_vencimento: string | null
          empresa: string | null
          financeiro_id: string | null
          horario_chegada_previsto: string | null
          hotel: string | null
          hotel_id: string | null
          link_local_embarque: string | null
          local_embarque: string | null
          nota_id: string | null
          nota_url: string | null
          numero_nf: string | null
          observacao_gestor: string | null
          pendencia_financeira: boolean | null
          pendencia_nf: boolean | null
          preferencia_hospedagem: string | null
          quantidade_diarias: number | null
          quantidade_diarias_prevista: number | null
          quantidade_quartos: number | null
          regional: string | null
          reserva_id: string | null
          saldo_informado: number | null
          solicitacao_id: string | null
          solicitante_id: string | null
          solicitante_nome: string | null
          status_financeiro: string | null
          status_hospedagem: string | null
          status_nota: string | null
          status_solicitacao: string | null
          supervisao: string | null
          tipo_nota: string | null
          total_colaboradores: number | null
          uf: string | null
          valor_diaria: number | null
          valor_financeiro: number | null
          valor_nf: number | null
          valor_total_final: number | null
          valor_total_previsto: number | null
          xml_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospedagem_reservas_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_hoteis"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagem_producao_resumo: {
        Row: {
          checkouts: number | null
          hospedados: number | null
          hoteis_ativos: number | null
          total_diarias_geral: number | null
          total_diarias_stay: number | null
          ultima_data: string | null
        }
        Relationships: []
      }
      hospedagem_v3_itens: {
        Row: {
          cidade: string | null
          cliente: string | null
          codigo_operacional: string | null
          codigo_solicitacao: string | null
          colaborador_id: string | null
          coordenacao: string | null
          cpf: string | null
          data_checkin_prevista: string | null
          data_checkout_prevista: string | null
          empresa: string | null
          horario_chegada_previsto: string | null
          hotel: string | null
          hotel_id: string | null
          hotel_localizacao: string | null
          item_id: string | null
          link_local_embarque: string | null
          local_embarque: string | null
          motivo_recusa: string | null
          nome_colaborador: string | null
          observacao_gestor: string | null
          origem_solicitacao: string | null
          quantidade_diarias_prevista: number | null
          regional: string | null
          reserva_id: string | null
          sexo: string | null
          solicitacao_id: string | null
          solicitado_em: string | null
          solicitante_id: string | null
          solicitante_nome: string | null
          status_hospedagem: string | null
          status_item: string | null
          supervisao: string | null
          uf: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hosp_solic_colab_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_painel_geral"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "hosp_solic_colab_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospedagem_reservas_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_hoteis"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_alimentacao_ultima: {
        Row: {
          almoco: boolean | null
          cafe: boolean | null
          colaborador_id: string | null
          created_at: string | null
          data_referencia: string | null
          id: string | null
          janta: boolean | null
          nome_colaborador: string | null
          observacao: string | null
          programacao_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_alimentacao_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_alimentacao_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_colaboradores_ultima: {
        Row: {
          cargo: string | null
          colaborador_id: string | null
          coordenacao: string | null
          created_at: string | null
          data_referencia: string | null
          disponibilidade: string | null
          id: string | null
          nome_colaborador: string | null
          observacao: string | null
          placa_veiculo: string | null
          programacao_id: string | null
          supervisao: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_colaboradores_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_colaboradores_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_deslocamento_ultima: {
        Row: {
          colaborador_id: string | null
          created_at: string | null
          data_referencia: string | null
          destino: string | null
          id: string | null
          km: number | null
          nome_colaborador: string | null
          observacao: string | null
          origem: string | null
          placa_veiculo: string | null
          programacao_id: string | null
          tipo_deslocamento: string | null
          updated_at: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_deslocamento_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_deslocamento_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_despesas_os_compartilhadas: {
        Row: {
          colaborador_id: string | null
          data_referencia: string | null
          despesa_id: string | null
          detalhes: Json | null
          nome_colaborador: string | null
          os_id: string | null
          programacao_exibicao_id: string | null
          programacao_origem_id: string | null
          tipo_registro: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_equipe_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "operacional_os"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_equipe_programacao_id_fkey"
            columns: ["programacao_exibicao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_equipe_programacao_id_fkey"
            columns: ["programacao_exibicao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_dia_ultima: {
        Row: {
          coordenacao: string | null
          created_at: string | null
          criado_por: string | null
          data_referencia: string | null
          id: string | null
          regional: string | null
          status: string | null
          supervisao: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      programacao_equipe_colaborador_ultima: {
        Row: {
          colaborador_id: string | null
          confirmado: boolean | null
          created_at: string | null
          id: string | null
          km_estimado: number | null
          nome_colaborador: string | null
          ordem_rota: number | null
          os_id: string | null
          programacao_id: string | null
          score: number | null
          score_auditoria: number | null
          score_contrato: number | null
          score_distancia: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_equipe_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "operacional_os"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_equipe_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_equipe_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_equipe_ultima: {
        Row: {
          colaborador_id: string | null
          confirmado: boolean | null
          created_at: string | null
          id: string | null
          km_estimado: number | null
          nome_colaborador: string | null
          ordem_rota: number | null
          os_id: string | null
          programacao_id: string | null
          score: number | null
          score_auditoria: number | null
          score_contrato: number | null
          score_distancia: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_equipe_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "operacional_os"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_equipe_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_equipe_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_estadia_ultima: {
        Row: {
          alojamento_id: string | null
          alojamento_nome: string | null
          checkin: string | null
          checkout: string | null
          cidade: string | null
          colaborador_id: string | null
          created_at: string | null
          data_referencia: string | null
          diarias: number | null
          id: string | null
          nome_colaborador: string | null
          observacao: string | null
          programacao_id: string | null
          tem_estadia: boolean | null
          tipo_estadia: string | null
          uf: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_estadia_alojamento_id_fkey"
            columns: ["alojamento_id"]
            isOneToOne: false
            referencedRelation: "hospedagem_alojamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_estadia_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_estadia_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_extras_ultima: {
        Row: {
          colaborador_id: string | null
          created_at: string | null
          data_referencia: string | null
          descricao: string | null
          id: string | null
          nome_colaborador: string | null
          observacao: string | null
          programacao_id: string | null
          tipo_despesa: string | null
          updated_at: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_extras_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_extras_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_dia_ultima"
            referencedColumns: ["id"]
          },
        ]
      }
      v_leitura_supervisao: {
        Row: {
          coordenacao: string | null
          data_referencia: string | null
          leitura_pct: number | null
          lidos_30d: number | null
          supervisao: string | null
          total_ativos: number | null
        }
        Relationships: []
      }
      vw_alojamentos_ativos: {
        Row: {
          ativo: boolean | null
          cidade_uf: string | null
          id: string | null
          nome: string | null
        }
        Insert: {
          ativo?: boolean | null
          cidade_uf?: never
          id?: string | null
          nome?: string | null
        }
        Update: {
          ativo?: boolean | null
          cidade_uf?: never
          id?: string | null
          nome?: string | null
        }
        Relationships: []
      }
      vw_botconversa_resumo: {
        Row: {
          enviados: number | null
          erros: number | null
          pendentes: number | null
          ultima_data_snapshot: string | null
          ultimo_envio: string | null
        }
        Relationships: []
      }
      vw_colaboradores_atuais: {
        Row: {
          admissao: string | null
          ativo: boolean | null
          bairro: string | null
          cargo: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          conta_bancaria: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string | null
          data_nascimento: string | null
          data_referencia: string | null
          desligamento: string | null
          email_empresa: string | null
          email_pessoal: string | null
          empresa: string | null
          endereco: string | null
          estado: string | null
          id: string | null
          importacao_id: string | null
          nome: string | null
          salario: number | null
          situacao: string | null
          supervisao: string | null
          tipo: string | null
          whatsapp: string | null
        }
        Insert: {
          admissao?: never
          ativo?: never
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria?: string | null
          coordenacao?: string | null
          cpf?: never
          created_at?: never
          data_nascimento?: never
          data_referencia?: never
          desligamento?: never
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string | null
          importacao_id?: never
          nome?: string | null
          salario?: never
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          whatsapp?: string | null
        }
        Update: {
          admissao?: never
          ativo?: never
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria?: string | null
          coordenacao?: string | null
          cpf?: never
          created_at?: never
          data_nascimento?: never
          data_referencia?: never
          desligamento?: never
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string | null
          importacao_id?: never
          nome?: string | null
          salario?: never
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      vw_colaboradores_historico_ultimo: {
        Row: {
          admissao: string | null
          ativo: boolean | null
          bairro: string | null
          cargo: string | null
          cep: string | null
          chave_colaborador: string | null
          cidade: string | null
          complemento: string | null
          conta_bancaria: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string | null
          data_nascimento: string | null
          data_referencia: string | null
          desligamento: string | null
          email_empresa: string | null
          email_pessoal: string | null
          empresa: string | null
          endereco: string | null
          estado: string | null
          id: string | null
          importacao_id: string | null
          nome: string | null
          nome_normalizado: string | null
          payload: Json | null
          salario: number | null
          situacao: string | null
          supervisao: string | null
          tipo: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          admissao?: string | null
          ativo?: boolean | null
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          chave_colaborador?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          data_referencia?: string | null
          desligamento?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string | null
          importacao_id?: string | null
          nome?: string | null
          nome_normalizado?: string | null
          payload?: Json | null
          salario?: number | null
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          admissao?: string | null
          ativo?: boolean | null
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          chave_colaborador?: string | null
          cidade?: string | null
          complemento?: string | null
          conta_bancaria?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          data_referencia?: string | null
          desligamento?: string | null
          email_empresa?: string | null
          email_pessoal?: string | null
          empresa?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string | null
          importacao_id?: string | null
          nome?: string | null
          nome_normalizado?: string | null
          payload?: Json | null
          salario?: number | null
          situacao?: string | null
          supervisao?: string | null
          tipo?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      vw_conferencia_uber_corridas: {
        Row: {
          casa_latitude: number | null
          casa_longitude: number | null
          cidade: string | null
          cidade_base: string | null
          classificacao: string | null
          classificacao_manual: string | null
          colaborador_base_id: string | null
          coordenacao: string | null
          created_at: string | null
          data_chegada_local: string | null
          data_hora_transacao_utc: string | null
          data_solicitacao_local: string | null
          destino_latitude: number | null
          destino_longitude: number | null
          detalhamento_despesa: string | null
          distancia_destino_casa_km: number | null
          distancia_destino_embarque_km: number | null
          distancia_km: number | null
          distancia_mi: number | null
          distancia_partida_casa_km: number | null
          distancia_partida_embarque_km: number | null
          duracao_min: number | null
          endereco_base: string | null
          endereco_destino: string | null
          endereco_partida: string | null
          grupo: string | null
          hora_chegada_local: string | null
          hora_solicitacao_local: string | null
          hora_solicitacao_utc: string | null
          id: string | null
          menor_distancia_casa_km: number | null
          menor_distancia_embarque_km: number | null
          motivo_validacao: string | null
          nome: string | null
          nome_colaborador: string | null
          pais: string | null
          partida_latitude: number | null
          partida_longitude: number | null
          ponto_destino_mais_proximo: string | null
          ponto_partida_mais_proximo: string | null
          programa: string | null
          servico: string | null
          status_validacao: string | null
          supervisao: string | null
          uf_base: string | null
          validado_em: string | null
          valor: number | null
        }
        Relationships: []
      }
      vw_contexto_usuario: {
        Row: {
          auth_user_id: string | null
          colaborador_id: string | null
          coordenacao: string | null
          empresa: string | null
          modulo_categoria: string | null
          modulo_codigo: string | null
          modulo_icone: string | null
          modulo_id: string | null
          modulo_nome: string | null
          modulo_ordem: number | null
          modulo_rota: string | null
          perfil_codigo: string | null
          perfil_id: string | null
          perfil_nome: string | null
          pode_aprovar: boolean | null
          pode_criar: boolean | null
          pode_editar: boolean | null
          pode_excluir: boolean | null
          pode_ver: boolean | null
          supervisao: string | null
          telefone: string | null
          usuario_email: string | null
          usuario_id: string | null
          usuario_nome: string | null
          usuario_status: string | null
        }
        Relationships: []
      }
      vw_financeiro_alimentacao_pendentes: {
        Row: {
          codigo_colaborador: string | null
          colaborador: string | null
          colaborador_chave: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string | null
          data_ref: string | null
          distancia_m: number | null
          hora_identificada: string | null
          id: string | null
          local_cidade: string | null
          local_nome: string | null
          local_uf: string | null
          origem: string | null
          pontos_dentro_raio: number | null
          pontos_na_janela: number | null
          raio_m: number | null
          status: string | null
          supervisao: string | null
          ultima_verificacao_em: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          codigo_colaborador?: string | null
          colaborador?: string | null
          colaborador_chave?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string | null
          data_ref?: string | null
          distancia_m?: number | null
          hora_identificada?: string | null
          id?: string | null
          local_cidade?: string | null
          local_nome?: string | null
          local_uf?: string | null
          origem?: string | null
          pontos_dentro_raio?: number | null
          pontos_na_janela?: number | null
          raio_m?: number | null
          status?: string | null
          supervisao?: string | null
          ultima_verificacao_em?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          codigo_colaborador?: string | null
          colaborador?: string | null
          colaborador_chave?: string | null
          coordenacao?: string | null
          cpf?: string | null
          created_at?: string | null
          data_ref?: string | null
          distancia_m?: number | null
          hora_identificada?: string | null
          id?: string | null
          local_cidade?: string | null
          local_nome?: string | null
          local_uf?: string | null
          origem?: string | null
          pontos_dentro_raio?: number | null
          pontos_na_janela?: number | null
          raio_m?: number | null
          status?: string | null
          supervisao?: string | null
          ultima_verificacao_em?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      vw_metas_producao_estado: {
        Row: {
          ano: number | null
          estado: string | null
          mes: number | null
          meta_tons: number | null
          percentual_atingido: number | null
          produzido_tons: number | null
          restante_tons: number | null
        }
        Relationships: []
      }
      vw_metas_producao_mensal: {
        Row: {
          ano: number | null
          mes: number | null
          meta_total_tons: number | null
          percentual_atingido: number | null
          produzido_total_tons: number | null
          restante_total_tons: number | null
        }
        Relationships: []
      }
      vw_metas_producao_regional: {
        Row: {
          ano: number | null
          estado: string | null
          mes: number | null
          meta_tons: number | null
          percentual_atingido: number | null
          produzido_tons: number | null
          regional: string | null
          restante_tons: number | null
        }
        Relationships: []
      }
      vw_monitoramento_sync: {
        Row: {
          agente: string | null
          duracao_media_segundos: number | null
          ultima_criacao: string | null
          ultima_finalizacao: string | null
          ultimo_erro: string | null
          ultimo_status: string | null
        }
        Relationships: []
      }
      vw_patrimonios_atual: {
        Row: {
          categoria: string | null
          coordenacao: string | null
          created_at: string | null
          data_aquisicao: string | null
          data_registro: string | null
          dias_sem_leitura: number | null
          funcionario: string | null
          id: string | null
          identificacao: string | null
          importacao_id: string | null
          importado_em: string | null
          marca: string | null
          modelo: string | null
          nome_arquivo: string | null
          patrimonio_codigo: string | null
          situacao: string | null
          supervisao: string | null
          ultima_leitura: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patrimonios_snapshot_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "patrimonios_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_patrimonios_responsavel_atual: {
        Row: {
          categoria: string | null
          desde: string | null
          identificacao: string | null
          patrimonio_id: string | null
          regional: string | null
          responsavel_atual: string | null
          supervisao: string | null
        }
        Relationships: []
      }
      vw_relatorios_importacoes_ativas: {
        Row: {
          arquivo_nome_original: string | null
          arquivo_nome_storage: string | null
          created_at: string | null
          fingerprint: string | null
          id: string | null
          importado_por: string | null
          importado_por_nome: string | null
          mime_type: string | null
          modo_importacao: string | null
          nome_arquivo: string | null
          observacoes: string | null
          path: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          status: string | null
          storage_bucket: string | null
          storage_path: string | null
          substitui_importacoes: Json | null
          tamanho_bytes: number | null
          tipo: string | null
          tipo_relatorio: string | null
          titulo_relatorio: string | null
          total_periodo_registros: number | null
          updated_at: string | null
          url: string | null
          usuario_email: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          arquivo_nome_original?: string | null
          arquivo_nome_storage?: string | null
          created_at?: string | null
          fingerprint?: string | null
          id?: string | null
          importado_por?: string | null
          importado_por_nome?: string | null
          mime_type?: string | null
          modo_importacao?: string | null
          nome_arquivo?: string | null
          observacoes?: string | null
          path?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          substitui_importacoes?: Json | null
          tamanho_bytes?: number | null
          tipo?: string | null
          tipo_relatorio?: string | null
          titulo_relatorio?: string | null
          total_periodo_registros?: number | null
          updated_at?: string | null
          url?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          arquivo_nome_original?: string | null
          arquivo_nome_storage?: string | null
          created_at?: string | null
          fingerprint?: string | null
          id?: string | null
          importado_por?: string | null
          importado_por_nome?: string | null
          mime_type?: string | null
          modo_importacao?: string | null
          nome_arquivo?: string | null
          observacoes?: string | null
          path?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          substitui_importacoes?: Json | null
          tamanho_bytes?: number | null
          tipo?: string | null
          tipo_relatorio?: string | null
          titulo_relatorio?: string | null
          total_periodo_registros?: number | null
          updated_at?: string | null
          url?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      vw_usuario_modulos: {
        Row: {
          codigo: string | null
          email: string | null
          modulo_id: string | null
          modulo_nome: string | null
          nome: string | null
          setor: string | null
          usuario_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _normalizar_texto_g1000: { Args: { valor: string }; Returns: string }
      _somente_digitos_g1000: { Args: { valor: string }; Returns: string }
      abertura_os_norm_sup: { Args: { p: string }; Returns: string }
      abertura_os_regional_liberada: {
        Args: { p_regional: string }
        Returns: boolean
      }
      activate_grm_sync_8_lanes_v2: { Args: never; Returns: Json }
      ajuda_custo_gerar_lote: { Args: { p_competencia: string }; Returns: Json }
      ajuda_custo_reenviar_caixa: { Args: { p_lote_id: string }; Returns: Json }
      ajuda_custo_usuario_tem_acesso: { Args: never; Returns: boolean }
      alocar_os_existente_abertura_os: {
        Args: { p_id: string; p_numero_os: string }
        Returns: Json
      }
      aplicar_colaboradores_iniciais_abertura_os: {
        Args: never
        Returns: number
      }
      ativar_grm_despesas_do_dia: { Args: never; Returns: Json }
      auto_validar_uber_por_laudo: {
        Args: { p_fim?: string; p_inicio?: string }
        Returns: Json
      }
      bonus_competencia_fechada: {
        Args: { p_competencia: string }
        Returns: boolean
      }
      bonus_normalizar_nome: { Args: { p_nome: string }; Returns: string }
      bonus_producao_cache_refresh: {
        Args: { p_competencia: string; p_force?: boolean }
        Returns: undefined
      }
      bonus_producao_competencia: {
        Args: { p_competencia: string }
        Returns: {
          colaborador: string
          inapto_auditoria: boolean
          motivo: string
          patrimonio_dias: number
          status: string
          tons: number
          valor: number
        }[]
      }
      bonus_producao_competencia_calcular: {
        Args: { p_competencia: string }
        Returns: {
          colaborador: string
          inapto_auditoria: boolean
          motivo: string
          patrimonio_dias: number
          status: string
          tons: number
          valor: number
        }[]
      }
      bonus_solicitar_lancamento_caixa: {
        Args: { p_colaboradores: string[]; p_competencia: string }
        Returns: Json
      }
      bonus_substituir_auditoria: {
        Args: { p_arquivo_nome?: string; p_competencia: string; p_itens: Json }
        Returns: Json
      }
      bonus_usuario_tem_acesso: { Args: never; Returns: boolean }
      claim_logistica_ocr_job: {
        Args: { p_worker_id: string }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          document_type: string
          document_url: string
          error: string | null
          expires_at: string
          file_type: string
          id: number
          instruction: string | null
          locked_at: string | null
          numero_os: string | null
          os_id: string | null
          page_current: number | null
          page_total: number | null
          priority: number
          progress: number
          raw_ocr: Json | null
          raw_text: string | null
          request_user_id: string
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
          worker_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "logistica_ocr_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_next_frotas_veiculo_grm_cadastro: {
        Args: never
        Returns: {
          ano: number | null
          ano_fabricacao: number | null
          ano_modelo: number | null
          apolice_seguro: string | null
          arquivo_nome: string | null
          bfleet_ano: string | null
          bfleet_ativo_nome: string | null
          bfleet_condutor: string | null
          bfleet_condutor_atualizado_em: string | null
          bfleet_condutor_erro: string | null
          bfleet_condutor_id: string | null
          bfleet_condutor_status: string | null
          bfleet_confirmado: boolean | null
          bfleet_device_id: string | null
          bfleet_divergencia: boolean | null
          bfleet_gatewayip: string | null
          bfleet_grupo: string | null
          bfleet_id: string | null
          bfleet_idgps: string | null
          bfleet_marca: string | null
          bfleet_mensagem: string | null
          bfleet_modelo: string | null
          bfleet_nome: string | null
          bfleet_odometro: string | null
          bfleet_patente: string | null
          bfleet_placa: string | null
          bfleet_rastreador: boolean | null
          bfleet_raw: Json | null
          bfleet_status: string | null
          bfleet_sync_at: string | null
          bfleet_ultima_sincronizacao_em: string | null
          bfleet_ultima_sync_em: string | null
          bfleet_vehicle_id: string | null
          chassi: string | null
          cnpj: string | null
          combustivel: string | null
          condutor_divergente: boolean | null
          condutor_patrimonio: string | null
          coordenacao: string | null
          cor: string | null
          created_at: string
          detran_confirmado: boolean
          detran_mensagem: string | null
          detran_raw: Json
          detran_status: string
          detran_token_key: string | null
          detran_ultima_consulta_em: string | null
          dia_vencimento: number | null
          empresa: string | null
          especie: string | null
          grm_cadastro_em: string | null
          grm_cadastro_mensagem: string | null
          grm_cadastro_status: string | null
          grm_cadastro_tentativas: number
          grm_cadastro_travado_em: string | null
          grm_patrimonio_numero: string | null
          grm_veh_code: number | null
          hodometro: number | null
          id: string
          import_hash: string | null
          marca: string | null
          marca_modelo: string | null
          modelo: string | null
          motorista_atual: string | null
          multas_mensagem: string | null
          multas_status: string | null
          multas_ultima_consulta_em: string | null
          municipio_uf: string | null
          nome: string | null
          observacoes: string | null
          origem: string | null
          origem_importacao: string
          patrimonio_codigo: string | null
          patrimonio_coordenacao: string | null
          patrimonio_data_upload: string | null
          patrimonio_dias_sem_leitura: number | null
          patrimonio_funcionario: string | null
          patrimonio_identificacao: string | null
          patrimonio_importacao_id: string | null
          patrimonio_supervisao: string | null
          patrimonio_sync_em: string | null
          patrimonio_ultima_leitura: string | null
          placa: string
          placa_normalizada: string | null
          possui_rastreador: boolean | null
          rastreador_bfleet: boolean | null
          rastreador_origem: string | null
          raw: Json
          renavam: string | null
          rs_km: number | null
          seguro_vencimento: string | null
          situacao_detran: string | null
          situacao_veiculo: string | null
          status: string
          supervisao: string | null
          tipo: string | null
          tipo_veiculo: string | null
          updated_at: string
          valor_km: number | null
          valor_mensal: number | null
        }
        SetofOptions: {
          from: "*"
          to: "frotas_veiculos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_next_grm_despesa_fila: {
        Args: { p_excluir_ids?: string[] }
        Returns: {
          acao: string
          colaborador_id: string | null
          cpf: string
          created_at: string
          data_referencia: string
          diagnostico: Json
          finalizado_em: string | null
          hash_desejado: string
          id: string
          locked_at: string | null
          max_tentativas: number
          nome: string
          programacao_id: string | null
          regional: string
          regras: Json
          screenshot_path: string | null
          status: string
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
          versao_id: string
        }
        SetofOptions: {
          from: "*"
          to: "grm_despesas_fila"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_next_grm_reabertura_os: {
        Args: { p_os?: string; p_prioridade_max?: number }
        Returns: {
          created_at: string
          criterio_fechamento: string | null
          data_os: string | null
          dias_sem_embarque: number | null
          dias_sem_fob: number | null
          erro: string | null
          fechamento_data: string
          fechamento_em: string
          id: string
          motivos: string[]
          observacao: string | null
          os: string
          prioridade: number
          reaberto_em: string | null
          regra_snapshot: Json
          remanescente: number | null
          resultado_fechamento_id: number | null
          servico: string | null
          snapshot_lista_os_em: string | null
          status: string
          tentativas: number
          ultimo_embarque: string | null
          ultimo_fob: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "grm_reabertura_os_fila"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_next_grm_sync_job: {
        Args: { p_lane: string; p_worker_id: string }
        Returns: {
          agente_id: string
          created_at: string
          duration_ms: number | null
          erro: string | null
          finalizado_em: string | null
          heartbeat_at: string | null
          id: string
          iniciado_em: string | null
          lane: string | null
          lease_expires_at: string | null
          memory_peak_mb: number | null
          output: Json | null
          payload: Json | null
          pipeline_seq: number | null
          solicitado_em: string
          solicitado_por: string | null
          status: string
          tentativas: number
          updated_at: string
          vps_disk_total_mb: number | null
          vps_disk_used_mb: number | null
          vps_memory_peak_mb: number | null
          vps_memory_total_mb: number | null
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "grm_sync_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_next_programacao_transferencia: {
        Args: never
        Returns: {
          chegada_confirmada_em: string | null
          chegada_confirmada_por_nome: string | null
          chegada_prevista: string | null
          colaborador_cargo: string | null
          colaborador_cpf: string
          colaborador_nome: string
          coordenacao_origem: string | null
          created_at: string
          em_deslocamento: boolean
          grm_aplicado_em: string | null
          grm_erro: string | null
          grm_locked_at: string | null
          grm_resultado: Json | null
          grm_status: string
          grm_tentativas: number
          id: string
          motivo: string | null
          motivo_recusa: string | null
          patrimonios: Json
          respondido_em: string | null
          respondido_por: string | null
          respondido_por_nome: string | null
          solicitado_em: string
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          supervisao_destino: string
          supervisao_origem: string
          tipo: string
          transferir_patrimonios: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "programacao_transferencias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      completar_lancamento_nf: {
        Args: { p_ajustes: Json; p_id: string }
        Returns: undefined
      }
      conf_distancia_km: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      conf_norm_txt: { Args: { value: string }; Returns: string }
      confirmar_nf_sugerida: {
        Args: {
          p_aceitar: boolean
          p_item_id: string
          p_motivo?: string
          p_usuario?: string
        }
        Returns: Json
      }
      corrigir_e_reenviar_abertura_os: {
        Args: { p_id: string; p_observacao?: string; p_payload: Json }
        Returns: Json
      }
      cron_trigger_sync_multas_detran_full: { Args: never; Returns: undefined }
      dashboard_producao_agregada: {
        Args: { p_coordenacao?: string; p_data_fim: string; p_data_ini: string }
        Returns: {
          coordenacao: string
          data: string
          tons: number
        }[]
      }
      decidir_abertura_os: {
        Args: {
          p_acao: string
          p_campos_corrigir?: Json
          p_id: string
          p_observacao?: string
        }
        Returns: Json
      }
      decidir_finalizacao_os_logistica: {
        Args: { p_aprovar: boolean; p_os_id: string }
        Returns: Json
      }
      dre_notas_fiscais_deduplicadas: {
        Args: never
        Returns: {
          created_at: string
          dados_json: Json
          numero_nf: string
        }[]
      }
      duplicar_programacao_dia: {
        Args: {
          p_copiar_estadias?: boolean
          p_datas: string[]
          p_programacao_id: string
        }
        Returns: Json
      }
      duplicar_programacao_dia_base_20260813: {
        Args: { p_datas: string[]; p_programacao_id: string }
        Returns: Json
      }
      enqueue_grm_reabertura_os: { Args: never; Returns: Json }
      enqueue_grm_reabertura_os_real: {
        Args: { p_quantidade?: number }
        Returns: Json
      }
      enqueue_grm_sync_job_internal: {
        Args: { p_agent_id: string; p_payload?: Json }
        Returns: string
      }
      enqueue_grm_sync_queue: {
        Args: { p_agent_ids: string[] }
        Returns: number
      }
      enqueue_next_grm_fixed_job: {
        Args: never
        Returns: {
          agente_id: string
          created_at: string
          duration_ms: number | null
          erro: string | null
          finalizado_em: string | null
          heartbeat_at: string | null
          id: string
          iniciado_em: string | null
          lane: string | null
          lease_expires_at: string | null
          memory_peak_mb: number | null
          output: Json | null
          payload: Json | null
          pipeline_seq: number | null
          solicitado_em: string
          solicitado_por: string | null
          status: string
          tentativas: number
          updated_at: string
          vps_disk_total_mb: number | null
          vps_disk_used_mb: number | null
          vps_memory_peak_mb: number | null
          vps_memory_total_mb: number | null
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "grm_sync_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_grm_fixed_pipeline_capacity: { Args: never; Returns: number }
      ensure_grm_scheduled_agents: { Args: never; Returns: number }
      equipe_listar_usuarios: {
        Args: never
        Returns: {
          email: string
          id: string
          nome: string
          setor: string
        }[]
      }
      extrair_placa_texto: { Args: { p_texto: string }; Returns: string }
      faturamento_sync_grm: { Args: { p_dias?: number }; Returns: Json }
      finalizar_grm_reabertura_os: {
        Args: {
          p_erro?: string
          p_fila_id: string
          p_observacao?: string
          p_status: string
        }
        Returns: {
          created_at: string
          criterio_fechamento: string | null
          data_os: string | null
          dias_sem_embarque: number | null
          dias_sem_fob: number | null
          erro: string | null
          fechamento_data: string
          fechamento_em: string
          id: string
          motivos: string[]
          observacao: string | null
          os: string
          prioridade: number
          reaberto_em: string | null
          regra_snapshot: Json
          remanescente: number | null
          resultado_fechamento_id: number | null
          servico: string | null
          snapshot_lista_os_em: string | null
          status: string
          tentativas: number
          ultimo_embarque: string | null
          ultimo_fob: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "grm_reabertura_os_fila"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_habilitar_auditoria: {
        Args: { p_modulo?: string; p_tabela: string }
        Returns: undefined
      }
      fob_lote_recente: {
        Args: { p_dias?: number; p_table: string }
        Returns: {
          created_at: string
          dados_json: Json
          id: string
        }[]
      }
      fob_producao_lote_vencedor: {
        Args: {
          p_dias?: number
          p_gap_minutos?: number
          p_referencia_ddmmyyyy: string
        }
        Returns: {
          created_at: string
          dados_json: Json
          id: string
        }[]
      }
      frotas_chave_placa: { Args: { p_placa: string }; Returns: string }
      frotas_dossie_classificar_uso: {
        Args: { p_det: Json; p_fator?: number; p_min_km?: number }
        Returns: Json
      }
      frotas_dossie_entidades: { Args: { t: string }; Returns: string }
      frotas_dossie_fmt: {
        Args: { casas?: number; n: number }
        Returns: string
      }
      frotas_dossie_hav: {
        Args: { la1: number; la2: number; lo1: number; lo2: number }
        Returns: number
      }
      frotas_dossie_notificacao_montar: {
        Args: { p_data: string; p_placa: string }
        Returns: Json
      }
      frotas_dossie_notificar: {
        Args: { p_data: string; p_placa: string }
        Returns: Json
      }
      frotas_dossie_posicao_em: {
        Args: {
          casa_la: number
          casa_lo: number
          modo: string
          trips: Json
          ts: string
        }
        Returns: Json
      }
      frotas_dossie_sobrep_s: {
        Args: { a1: string; a2: string; b1: string; b2: string }
        Returns: number
      }
      frotas_fora_horario_acao: {
        Args: {
          p_acao: string
          p_justificativa?: string
          p_ocorrencia_id: string
        }
        Returns: Json
      }
      frotas_fora_horario_acao_v2: {
        Args: {
          p_acao: string
          p_justificativa?: string
          p_ocorrencia_id: string
        }
        Returns: Json
      }
      frotas_fora_horario_dossie_gerar: {
        Args: { p_data: string; p_placa?: string }
        Returns: number
      }
      frotas_fora_horario_dossie_montar: {
        Args: {
          p_base_fim?: string
          p_base_ini?: string
          p_data: string
          p_fator?: number
          p_placa?: string
          p_raio_casa_km?: number
          p_tol_min?: number
          p_vel_kmh?: number
        }
        Returns: {
          atraso_retorno_min: number
          caronas: Json
          chegada_casa: string
          condutor_escalado: string
          confianca: string
          coordenacao: string
          criterio: string
          detalhes: Json
          excessos_fora: number
          fim_expediente: string
          fonte_expediente: string
          inicio_expediente: string
          janela_fim: string
          janela_inicio: string
          km_apos_chegada: number
          km_dia: number
          km_fora: number
          km_indevido: number
          km_noturno: number
          min_fora: number
          motivos: Json
          motorista: string
          placa: string
          primeiro_informativo: string
          qtd_excessos: number
          qtd_informativos: number
          retorno_previsto: string
          saida_casa: string
          supervisao: string
          ultimo_informativo: string
          uso_sem_base: boolean
          vel_max: number
          veredito: string
          veredito_uso: string
          viagens_dia: number
          viagens_fora: number
          viagens_indevidas: number
        }[]
      }
      frotas_fora_horario_garantir: { Args: { p_dias?: number }; Returns: Json }
      frotas_motorista_em_data: {
        Args: { p_data: string; p_veiculo_id: string }
        Returns: string
      }
      frotas_rastreadores_manutencao_automatica: {
        Args: never
        Returns: string
      }
      frotas_usuario_tem_acesso: { Args: never; Returns: boolean }
      frotas_veiculo_grm_reenfileirar_paradas: { Args: never; Returns: string }
      frotas_veiculo_grm_reenviar: {
        Args: { p_id: string }
        Returns: {
          ano: number | null
          ano_fabricacao: number | null
          ano_modelo: number | null
          apolice_seguro: string | null
          arquivo_nome: string | null
          bfleet_ano: string | null
          bfleet_ativo_nome: string | null
          bfleet_condutor: string | null
          bfleet_condutor_atualizado_em: string | null
          bfleet_condutor_erro: string | null
          bfleet_condutor_id: string | null
          bfleet_condutor_status: string | null
          bfleet_confirmado: boolean | null
          bfleet_device_id: string | null
          bfleet_divergencia: boolean | null
          bfleet_gatewayip: string | null
          bfleet_grupo: string | null
          bfleet_id: string | null
          bfleet_idgps: string | null
          bfleet_marca: string | null
          bfleet_mensagem: string | null
          bfleet_modelo: string | null
          bfleet_nome: string | null
          bfleet_odometro: string | null
          bfleet_patente: string | null
          bfleet_placa: string | null
          bfleet_rastreador: boolean | null
          bfleet_raw: Json | null
          bfleet_status: string | null
          bfleet_sync_at: string | null
          bfleet_ultima_sincronizacao_em: string | null
          bfleet_ultima_sync_em: string | null
          bfleet_vehicle_id: string | null
          chassi: string | null
          cnpj: string | null
          combustivel: string | null
          condutor_divergente: boolean | null
          condutor_patrimonio: string | null
          coordenacao: string | null
          cor: string | null
          created_at: string
          detran_confirmado: boolean
          detran_mensagem: string | null
          detran_raw: Json
          detran_status: string
          detran_token_key: string | null
          detran_ultima_consulta_em: string | null
          dia_vencimento: number | null
          empresa: string | null
          especie: string | null
          grm_cadastro_em: string | null
          grm_cadastro_mensagem: string | null
          grm_cadastro_status: string | null
          grm_cadastro_tentativas: number
          grm_cadastro_travado_em: string | null
          grm_patrimonio_numero: string | null
          grm_veh_code: number | null
          hodometro: number | null
          id: string
          import_hash: string | null
          marca: string | null
          marca_modelo: string | null
          modelo: string | null
          motorista_atual: string | null
          multas_mensagem: string | null
          multas_status: string | null
          multas_ultima_consulta_em: string | null
          municipio_uf: string | null
          nome: string | null
          observacoes: string | null
          origem: string | null
          origem_importacao: string
          patrimonio_codigo: string | null
          patrimonio_coordenacao: string | null
          patrimonio_data_upload: string | null
          patrimonio_dias_sem_leitura: number | null
          patrimonio_funcionario: string | null
          patrimonio_identificacao: string | null
          patrimonio_importacao_id: string | null
          patrimonio_supervisao: string | null
          patrimonio_sync_em: string | null
          patrimonio_ultima_leitura: string | null
          placa: string
          placa_normalizada: string | null
          possui_rastreador: boolean | null
          rastreador_bfleet: boolean | null
          rastreador_origem: string | null
          raw: Json
          renavam: string | null
          rs_km: number | null
          seguro_vencimento: string | null
          situacao_detran: string | null
          situacao_veiculo: string | null
          status: string
          supervisao: string | null
          tipo: string | null
          tipo_veiculo: string | null
          updated_at: string
          valor_km: number | null
          valor_mensal: number | null
        }
        SetofOptions: {
          from: "*"
          to: "frotas_veiculos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      frotas_veiculos_motoristas_inativos: {
        Args: never
        Returns: {
          chave: string
          motivo: string
        }[]
      }
      geocode_colaborador_base_pendentes: {
        Args: never
        Returns: {
          bairro: string
          cep: string
          cidade: string
          colaborador_id: string
          cpf: string
          endereco: string
          estado: string
          nome: string
          nome_chave: string
        }[]
      }
      gerar_codigo_compra: { Args: { p_tipo: string }; Returns: string }
      get_user_context: { Args: { p_user_id: string }; Returns: Json }
      grm_abertura_os_reenfileirar_orfas: { Args: never; Returns: string }
      grm_alerta_enviar: { Args: { p_mensagem: string }; Returns: number }
      grm_alerta_login_parado: { Args: never; Returns: string }
      grm_alerta_servicos_continuos: { Args: never; Returns: string }
      grm_cafe_login_valido: {
        Args: {
          p_colaborador_id: string
          p_cpf: string
          p_data: string
          p_nome: string
          p_programacao_id: string
          p_versao_id: string
        }
        Returns: boolean
      }
      grm_create_staging_table: {
        Args: { p_table: string }
        Returns: undefined
      }
      grm_despesas_status_por_colaborador:
        | {
            Args: { p_colaborador_ids: string[] }
            Returns: {
              aplicado_em: string
              colaborador_id: string
              data_referencia: string
              houve_alteracao: boolean
              status_aplicacao: string
            }[]
          }
        | {
            Args: {
              p_colaborador_ids: string[]
              p_data_max?: string
              p_data_min?: string
            }
            Returns: {
              aplicado_em: string
              colaborador_id: string
              data_referencia: string
              houve_alteracao: boolean
              status_aplicacao: string
            }[]
          }
      grm_diaria_programacao_valida: {
        Args: { p_colaborador_id: string; p_data: string; p_nome: string }
        Returns: boolean
      }
      grm_filtrar_regras_programacao: {
        Args: {
          p_colaborador_id: string
          p_data: string
          p_nome: string
          p_regras: Json
          p_versao_id: string
        }
        Returns: Json
      }
      grm_fixed_agent_for_seq: { Args: { p_seq: number }; Returns: string }
      grm_hoje_sao_paulo: { Args: never; Returns: string }
      grm_limpar_staging: { Args: { p_table: string }; Returns: Json }
      grm_promover_staging: {
        Args: { p_min_rows?: number; p_table: string }
        Returns: Json
      }
      grm_promover_staging_periodo: {
        Args: { p_date_column: string; p_min_rows?: number; p_table: string }
        Returns: Json
      }
      grm_staging_status: {
        Args: never
        Returns: {
          linhas_final: number
          linhas_staging: number
          tabela: string
          tabela_final_existe: boolean
          tabela_staging_existe: boolean
        }[]
      }
      grm_sync_lane_for_agent: { Args: { p_agent_id: string }; Returns: string }
      grm_sync_target_lane_for_agent: {
        Args: { p_agent_id: string }
        Returns: string
      }
      grm_token_entregar: { Args: { p_token: string }; Returns: Json }
      grm_token_entregas_status: {
        Args: { p_limite?: number }
        Returns: {
          aplicado_em: string
          enviado_em: string
          id: string
          mensagem: string
          status: string
          token_exp: string
          user_email: string
        }[]
      }
      grm_ultima_movimentacao_os: {
        Args: { p_oss: string[] }
        Returns: {
          numero_os: string
          total_cargas: number
          ultima_movimentacao: string
        }[]
      }
      hospedagem_cancelar_solicitacao: {
        Args: { p_motivo: string; p_solicitacao_id: string }
        Returns: Json
      }
      hospedagem_carregar_painel_v2: { Args: never; Returns: Json }
      hospedagem_conciliar_hotel:
        | {
            Args: {
              p_cidade: string
              p_endereco: string
              p_link_maps: string
              p_nome: string
              p_observacoes: string
              p_prioridade: string
              p_uf: string
              p_valor_duplo: number
              p_valor_individual: number
              p_valor_padrao: number
              p_valor_quadruplo: number
              p_valor_triplo: number
              p_whatsapp: string
            }
            Returns: string
          }
        | {
            Args: {
              p_cidade: string
              p_endereco: string
              p_link_maps: string
              p_nome: string
              p_observacoes: string
              p_prioridade: string
              p_uf: string
              p_valor_duplo: number
              p_valor_individual: number
              p_valor_padrao: number
              p_valor_quadruplo: string
              p_valor_triplo: number
              p_whatsapp: string
            }
            Returns: string
          }
      hospedagem_confirmar_pagamento_lote: {
        Args: {
          p_comprovante_url?: string
          p_lote_id: string
          p_valor_pago: number
        }
        Returns: Json
      }
      hospedagem_consumir_creditos: {
        Args: { p_hotel_id: string; p_limite: number; p_reserva_id: string }
        Returns: number
      }
      hospedagem_criar_solicitacao: {
        Args: { p_colaboradores: Json; p_solicitacao: Json }
        Returns: Json
      }
      hospedagem_criar_solicitacao_manual: {
        Args: {
          p_checkin: string
          p_checkout: string
          p_cidade: string
          p_colaborador_ids: string[]
          p_horario_chegada?: string
          p_observacao?: string
          p_uf: string
        }
        Returns: string
      }
      hospedagem_enviar_lote_financeiro: {
        Args: { p_lote_id?: string; p_reserva_id: string }
        Returns: string
      }
      hospedagem_importar_diarias_json: {
        Args: { p_importado_por?: string; p_linhas: Json }
        Returns: Json
      }
      hospedagem_importar_hoteis_json: {
        Args: { p_linhas: Json }
        Returns: {
          atualizados: number
          ignorados: number
          inseridos: number
          total_linhas: number
        }[]
      }
      hospedagem_json_get: {
        Args: { p_aliases: string[]; p_obj: Json }
        Returns: string
      }
      hospedagem_json_norm: { Args: { p_val: string }; Returns: string }
      hospedagem_json_texto: {
        Args: { p_chaves: string[]; p_linha: Json }
        Returns: string
      }
      hospedagem_listar_hoteis: {
        Args: never
        Returns: {
          aceita_pagamento_checkout: boolean | null
          agencia: string | null
          atualizado_por: string | null
          avaliacao_interna: number | null
          bairro: string | null
          banco: string | null
          cep: string | null
          chave_importacao: string | null
          chave_pix: string | null
          cidade: string
          cnpj_cpf: string | null
          condicao_pagamento_padrao: string | null
          conta: string | null
          created_at: string | null
          criado_por: string | null
          email: string | null
          email_financeiro: string | null
          emite_nota_fiscal: boolean
          endereco: string | null
          estacionamento: boolean | null
          favorecido: string | null
          grupo_origem: string | null
          icone_origem: string | null
          id: string
          inclui_almoco: boolean | null
          inclui_cafe: boolean | null
          inclui_janta: boolean | null
          latitude: number | null
          link_maps: string | null
          longitude: number | null
          nome: string
          observacoes: string | null
          origem_importacao: string | null
          pix_chave: string | null
          prioridade: string | null
          razao_social: string | null
          recebe_cotacao: boolean
          status: string | null
          telefone: string | null
          tipo_conta: string | null
          uf: string
          ultima_importacao_em: string | null
          updated_at: string | null
          valor_diaria_duplo: number | null
          valor_diaria_individual: number | null
          valor_diaria_padrao: number | null
          valor_diaria_quadruplo: number | null
          valor_diaria_triplo: number | null
          whatsapp: string | null
          whatsapp_validado: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "hospedagem_hoteis"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      hospedagem_norm_texto: { Args: { p_texto: string }; Returns: string }
      hospedagem_normalizar_telefone: {
        Args: { valor: string }
        Returns: string
      }
      hospedagem_normalizar_texto: { Args: { valor: string }; Returns: string }
      hospedagem_parse_money: { Args: { p_val: string }; Returns: number }
      hospedagem_pode_criar_solicitacao_manual: {
        Args: never
        Returns: boolean
      }
      hospedagem_pode_financeiro: {
        Args: { p_editar?: boolean }
        Returns: boolean
      }
      hospedagem_pode_operar: { Args: { p_editar?: boolean }; Returns: boolean }
      hospedagem_realizar_checkout: {
        Args: {
          p_colaboradores: Json
          p_extras?: Json
          p_observacoes?: string
          p_reserva_id: string
          p_valor_diarias: number
        }
        Returns: string
      }
      hospedagem_refresh_supervisao_solicitacao: {
        Args: { p_solicitacao_id: string }
        Returns: undefined
      }
      hospedagem_split_cidade_uf: {
        Args: { p_cidade: string }
        Returns: Record<string, unknown>
      }
      hospedagem_to_numeric: { Args: { p_texto: string }; Returns: number }
      hospedagem_uf_valida: { Args: { p_uf: string }; Returns: boolean }
      hospedagem_v3_cancelar_item: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      hospedagem_v3_confirmar_checkout_hotel: {
        Args: { p_decisao_id: string; p_resposta?: string }
        Returns: undefined
      }
      hospedagem_v3_confirmar_reserva_pedido: {
        Args: { p_pedido_id: string; p_resposta?: string }
        Returns: Json
      }
      hospedagem_v3_criar_pagamento: {
        Args: {
          p_boleto_url?: string
          p_chave_pix?: string
          p_enviar_financeiro?: boolean
          p_forma: string
          p_linha_digitavel?: string
          p_reserva_id: string
          p_valor: number
          p_vencimento?: string
        }
        Returns: string
      }
      hospedagem_v3_criar_solicitacao: {
        Args: { p_colaboradores: Json; p_solicitacao: Json }
        Returns: Json
      }
      hospedagem_v3_editar_solicitacao: {
        Args: {
          p_colaboradores: Json
          p_solicitacao: Json
          p_solicitacao_id: string
        }
        Returns: undefined
      }
      hospedagem_v3_enfileirar_nfse: {
        Args: { p_documento_id: string }
        Returns: string
      }
      hospedagem_v3_iniciar_cotacao: {
        Args: { p_hotel_ids: Json; p_item_ids: Json; p_solicitacao_id: string }
        Returns: Json
      }
      hospedagem_v3_preparar_nova_reserva_alteracao: {
        Args: { p_alteracao_id: string }
        Returns: Json
      }
      hospedagem_v3_recusar_item: {
        Args: { p_item_id: string; p_motivo: string }
        Returns: undefined
      }
      hospedagem_v3_redirecionar_prorrogacao: {
        Args: { p_decisao_id: string }
        Returns: Json
      }
      hospedagem_v3_registrar_extra: {
        Args: {
          p_descricao: string
          p_rateios?: Json
          p_reserva_id: string
          p_valor: number
        }
        Returns: string
      }
      hospedagem_v3_registrar_parcela: {
        Args: {
          p_comprovante_url: string
          p_data: string
          p_pagamento_id: string
          p_setor: string
          p_valor: number
        }
        Returns: string
      }
      hospedagem_v3_responder_checkout: {
        Args: {
          p_decisao: string
          p_decisao_id: string
          p_dias_adicionais?: number
        }
        Returns: undefined
      }
      hospedagem_v3_solicitar_alteracao: {
        Args: { p_dados?: Json; p_item_id: string; p_tipo: string }
        Returns: string
      }
      hospedagem_v3_solicitar_reserva: {
        Args: {
          p_cotacao_id?: string
          p_hotel_id: string
          p_item_ids: Json
          p_quartos?: Json
          p_solicitacao_id: string
          p_valor_diaria: number
        }
        Returns: string
      }
      hospedagem_v3_tratar_alteracao: {
        Args: { p_alteracao_id: string }
        Returns: string
      }
      hospedagem_v3_validar_checkout: {
        Args: { p_decisao_id: string }
        Returns: undefined
      }
      informar_ponto_problema_abertura_os: {
        Args: { p_descricao: string; p_id: string }
        Returns: Json
      }
      invalidar_dashboard_cache_segmentado: {
        Args: { p_origem?: string }
        Returns: number
      }
      is_chamados_ti_gestor: { Args: never; Returns: boolean }
      limpar_patrimonios_snapshot: { Args: never; Returns: undefined }
      match_ponto_embarque: {
        Args: { p_cliente: string; p_embarque: string; p_supervisao: string }
        Returns: string
      }
      nf_processamento_reenfileirar_paradas: { Args: never; Returns: string }
      nhe_existe_movimento_real: {
        Args: { p_data: string; p_os: string }
        Returns: boolean
      }
      nhe_existe_nhe_real: {
        Args: { p_data: string; p_os: string }
        Returns: boolean
      }
      norm_txt: { Args: { v: string }; Returns: string }
      normalizar_chave_local: { Args: { txt: string }; Returns: string }
      normalizar_embarque_texto: { Args: { txt: string }; Returns: string }
      normalize: { Args: { value: string }; Returns: string }
      notificar_nf_pendentes_atrasadas: { Args: never; Returns: undefined }
      operacional_distancia_km: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      operacional_os_garantir_vinculos_equipe: {
        Args: { p_os_id: string }
        Returns: number
      }
      operacional_ranking_embarque: {
        Args: { p_embarque_id: string }
        Returns: {
          cidade_base: string
          classificacao: string
          colaborador_base_id: string
          custo_total: number
          distancia_km: number
          hotel_diaria: number
          hotel_distancia_km: number
          hotel_id: string
          hotel_nome: string
          nome: string
          score_auditoria: number
          score_final: number
          tipo_mao_obra: string
          uf_base: string
          valor_alimentacao: number
          valor_mao_obra: number
          valor_passagem: number
        }[]
      }
      painel_current_context: { Args: never; Returns: Json }
      painel_has_module: {
        Args: { module_codes: string[]; require_edit?: boolean }
        Returns: boolean
      }
      painel_is_master: { Args: never; Returns: boolean }
      parse_embarque: {
        Args: { txt: string }
        Returns: {
          cidade: string
          local: string
          uf: string
        }[]
      }
      processar_cargas_geofence:
        | { Args: { p_data: string }; Returns: undefined }
        | { Args: { p_data: string; p_raio_m?: number }; Returns: Json }
      produtividade_custos_aprovados: {
        Args: { p_fim: string; p_inicio: string; p_por_dia?: boolean }
        Returns: {
          colaborador: string
          cpf: string
          data_referencia: string
          dias: number
          total_aprovado: number
        }[]
      }
      produtividade_custos_cobertura: {
        Args: never
        Returns: {
          fim: string
          inicio: string
        }[]
      }
      produtividade_producao_periodo: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          coordenacao: string
          dias: number
          dias_fim_semana: number
          funcionario: string
          toneladas: number
          valor_faturado: number
        }[]
      }
      programacao_caronas_dados: {
        Args: { p_programacao_id: string }
        Returns: {
          cliente: string
          colaborador_id: string
          emb_lat: number
          emb_lng: number
          embarque_label: string
          lat: number
          lng: number
          nome: string
          numero_os: string
          os_id: string
          ponto_id: string
          tem_frota: boolean
          veiculo_placa: string
          veiculo_proprio: boolean
        }[]
      }
      programacao_colaboradores_supervisao: {
        Args: { p_supervisao: string }
        Returns: {
          cargo: string
          colaborador_id: string
          nome: string
        }[]
      }
      programacao_etapa_b_candidatos: {
        Args: {
          p_excluir_colaborador_ids: string[]
          p_os: Json
          p_supervisao: string
        }
        Returns: {
          auditorias_peso: number
          auditorias_qtd: number
          cargo: string
          colab_lat: number
          colab_lng: number
          colaborador_id: string
          coordenacao: string
          custo_total: number
          km: number
          nome: string
          os_id: string
          score: number
          score_auditoria: number
          score_contrato: number
          score_distancia: number
          supervisao: string
          tipo_contrato: string
          veiculo_id: string
          veiculo_placa: string
        }[]
      }
      programacao_listar_supervisoes: {
        Args: never
        Returns: {
          nome: string
        }[]
      }
      programacao_supervisao_liberada: {
        Args: { p_supervisao: string }
        Returns: boolean
      }
      programacao_supervisoes_com_os_acionavel: {
        Args: { p_supervisoes: string[] }
        Returns: {
          supervisao: string
        }[]
      }
      programacao_sync_supervisoes_usuario: {
        Args: { p_app_usuario_id: string }
        Returns: undefined
      }
      programacao_transferencia_buscar_colaboradores: {
        Args: { p_supervisao_destino: string; p_termo: string }
        Returns: {
          cargo: string
          cpf: string
          nome: string
          pendente: boolean
          supervisao: string
        }[]
      }
      programacao_transferencia_cancelar: {
        Args: { p_id: string }
        Returns: {
          chegada_confirmada_em: string | null
          chegada_confirmada_por_nome: string | null
          chegada_prevista: string | null
          colaborador_cargo: string | null
          colaborador_cpf: string
          colaborador_nome: string
          coordenacao_origem: string | null
          created_at: string
          em_deslocamento: boolean
          grm_aplicado_em: string | null
          grm_erro: string | null
          grm_locked_at: string | null
          grm_resultado: Json | null
          grm_status: string
          grm_tentativas: number
          id: string
          motivo: string | null
          motivo_recusa: string | null
          patrimonios: Json
          respondido_em: string | null
          respondido_por: string | null
          respondido_por_nome: string | null
          solicitado_em: string
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          supervisao_destino: string
          supervisao_origem: string
          tipo: string
          transferir_patrimonios: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "programacao_transferencias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      programacao_transferencia_confirmar_chegada: {
        Args: { p_id: string }
        Returns: {
          chegada_confirmada_em: string | null
          chegada_confirmada_por_nome: string | null
          chegada_prevista: string | null
          colaborador_cargo: string | null
          colaborador_cpf: string
          colaborador_nome: string
          coordenacao_origem: string | null
          created_at: string
          em_deslocamento: boolean
          grm_aplicado_em: string | null
          grm_erro: string | null
          grm_locked_at: string | null
          grm_resultado: Json | null
          grm_status: string
          grm_tentativas: number
          id: string
          motivo: string | null
          motivo_recusa: string | null
          patrimonios: Json
          respondido_em: string | null
          respondido_por: string | null
          respondido_por_nome: string | null
          solicitado_em: string
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          supervisao_destino: string
          supervisao_origem: string
          tipo: string
          transferir_patrimonios: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "programacao_transferencias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      programacao_transferencia_destinos: {
        Args: never
        Returns: {
          nome: string
        }[]
      }
      programacao_transferencia_reenviar_grm: {
        Args: { p_id: string }
        Returns: {
          chegada_confirmada_em: string | null
          chegada_confirmada_por_nome: string | null
          chegada_prevista: string | null
          colaborador_cargo: string | null
          colaborador_cpf: string
          colaborador_nome: string
          coordenacao_origem: string | null
          created_at: string
          em_deslocamento: boolean
          grm_aplicado_em: string | null
          grm_erro: string | null
          grm_locked_at: string | null
          grm_resultado: Json | null
          grm_status: string
          grm_tentativas: number
          id: string
          motivo: string | null
          motivo_recusa: string | null
          patrimonios: Json
          respondido_em: string | null
          respondido_por: string | null
          respondido_por_nome: string | null
          solicitado_em: string
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          supervisao_destino: string
          supervisao_origem: string
          tipo: string
          transferir_patrimonios: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "programacao_transferencias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      programacao_transferencia_responder: {
        Args: {
          p_aceitar: boolean
          p_id: string
          p_motivo?: string
          p_transferir_patrimonios?: boolean
        }
        Returns: {
          chegada_confirmada_em: string | null
          chegada_confirmada_por_nome: string | null
          chegada_prevista: string | null
          colaborador_cargo: string | null
          colaborador_cpf: string
          colaborador_nome: string
          coordenacao_origem: string | null
          created_at: string
          em_deslocamento: boolean
          grm_aplicado_em: string | null
          grm_erro: string | null
          grm_locked_at: string | null
          grm_resultado: Json | null
          grm_status: string
          grm_tentativas: number
          id: string
          motivo: string | null
          motivo_recusa: string | null
          patrimonios: Json
          respondido_em: string | null
          respondido_por: string | null
          respondido_por_nome: string | null
          solicitado_em: string
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          supervisao_destino: string
          supervisao_origem: string
          tipo: string
          transferir_patrimonios: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "programacao_transferencias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      programacao_transferencia_solicitar: {
        Args: {
          p_chegada_prevista?: string
          p_colaborador_cpf: string
          p_em_deslocamento?: boolean
          p_motivo?: string
          p_supervisao_destino: string
          p_transferir_patrimonios: boolean
        }
        Returns: {
          chegada_confirmada_em: string | null
          chegada_confirmada_por_nome: string | null
          chegada_prevista: string | null
          colaborador_cargo: string | null
          colaborador_cpf: string
          colaborador_nome: string
          coordenacao_origem: string | null
          created_at: string
          em_deslocamento: boolean
          grm_aplicado_em: string | null
          grm_erro: string | null
          grm_locked_at: string | null
          grm_resultado: Json | null
          grm_status: string
          grm_tentativas: number
          id: string
          motivo: string | null
          motivo_recusa: string | null
          patrimonios: Json
          respondido_em: string | null
          respondido_por: string | null
          respondido_por_nome: string | null
          solicitado_em: string
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          supervisao_destino: string
          supervisao_origem: string
          tipo: string
          transferir_patrimonios: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "programacao_transferencias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      programacao_transferencia_solicitar_colaborador: {
        Args: {
          p_colaborador_cpf: string
          p_motivo?: string
          p_supervisao_destino: string
          p_transferir_patrimonios: boolean
        }
        Returns: {
          chegada_confirmada_em: string | null
          chegada_confirmada_por_nome: string | null
          chegada_prevista: string | null
          colaborador_cargo: string | null
          colaborador_cpf: string
          colaborador_nome: string
          coordenacao_origem: string | null
          created_at: string
          em_deslocamento: boolean
          grm_aplicado_em: string | null
          grm_erro: string | null
          grm_locked_at: string | null
          grm_resultado: Json | null
          grm_status: string
          grm_tentativas: number
          id: string
          motivo: string | null
          motivo_recusa: string | null
          patrimonios: Json
          respondido_em: string | null
          respondido_por: string | null
          respondido_por_nome: string | null
          solicitado_em: string
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          supervisao_destino: string
          supervisao_origem: string
          tipo: string
          transferir_patrimonios: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "programacao_transferencias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      programacao_transferir_colaborador_rascunho: {
        Args: {
          p_colaborador_id: string
          p_data: string
          p_programacao_destino: string
        }
        Returns: number
      }
      push_destinatarios: {
        Args: { p_notificacao_id: string }
        Returns: {
          auth: string
          endpoint: string
          p256dh: string
          sub_id: string
          user_id: string
        }[]
      }
      reenviar_abertura_os_corrigida: {
        Args: { p_id: string; p_payload: Json }
        Returns: Json
      }
      refresh_colaborador_cruzamento: { Args: never; Returns: undefined }
      refresh_grm_reabertura_os_fila: { Args: never; Returns: Json }
      registrar_localizacao_diaria_colaboradores: {
        Args: { p_data?: string }
        Returns: undefined
      }
      reorder_grm_sync_queue: {
        Args: { p_job_ids: string[] }
        Returns: undefined
      }
      resumo_faturamento_notas_periodo: {
        Args: { p_fim: string; p_inicio: string }
        Returns: number
      }
      rh_colaborador_na_data: {
        Args: { p_cpf?: string; p_data: string; p_nome?: string }
        Returns: {
          admissao: string | null
          ativo: boolean
          bairro: string | null
          cargo: string | null
          cep: string | null
          chave_colaborador: string | null
          cidade: string | null
          complemento: string | null
          conta_bancaria: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          data_referencia: string
          desligamento: string | null
          email_empresa: string | null
          email_pessoal: string | null
          empresa: string | null
          endereco: string | null
          estado: string | null
          id: string
          importacao_id: string | null
          nome: string
          nome_normalizado: string | null
          payload: Json
          salario: number | null
          situacao: string | null
          supervisao: string | null
          tipo: string | null
          updated_at: string
          whatsapp: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "colaboradores_historico"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rh_gerar_alertas_vencimento: { Args: never; Returns: Json }
      rh_plantao_pode_editar_setor: {
        Args: { p_setor: string }
        Returns: boolean
      }
      rh_plantao_setores_acesso: {
        Args: never
        Returns: {
          hora_fim: string
          hora_fim_2: string
          hora_inicio: string
          hora_inicio_2: string
          pode_editar: boolean
          setor: string
        }[]
      }
      rh_snapshot_na_data: {
        Args: { p_data: string }
        Returns: {
          admissao: string | null
          ativo: boolean
          bairro: string | null
          cargo: string | null
          cep: string | null
          chave_colaborador: string | null
          cidade: string | null
          complemento: string | null
          conta_bancaria: string | null
          coordenacao: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          data_referencia: string
          desligamento: string | null
          email_empresa: string | null
          email_pessoal: string | null
          empresa: string | null
          endereco: string | null
          estado: string | null
          id: string
          importacao_id: string | null
          nome: string
          nome_normalizado: string | null
          payload: Json
          salario: number | null
          situacao: string | null
          supervisao: string | null
          tipo: string | null
          updated_at: string
          whatsapp: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "colaboradores_historico"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rollback_grm_sync_8_lanes_v1: { Args: never; Returns: Json }
      rpc_get_user_context: { Args: never; Returns: Json }
      rpc_programacao_colaboradores_por_ids: {
        Args: { p_programacao_ids: string[] }
        Returns: {
          cargo: string | null
          colaborador_id: string
          coordenacao: string | null
          created_at: string
          data_referencia: string | null
          disponibilidade: string
          id: string
          nome_colaborador: string | null
          observacao: string | null
          placa_veiculo: string | null
          programacao_id: string | null
          supervisao: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "programacao_colaboradores"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_registrar_log: {
        Args: { p_acao: string; p_detalhes?: Json; p_modulo?: string }
        Returns: Json
      }
      rpc_upsert_usuario: {
        Args: {
          p_email: string
          p_nome: string
          p_perfil_codigo: string
          p_status: string
          p_telefone: string
        }
        Returns: Json
      }
      salvar_logistica_fob_importacao: {
        Args: { p_linhas: Json }
        Returns: Json
      }
      salvar_programacao: {
        Args: {
          p_coordenacao: string
          p_data: string
          p_itens: Json
          p_solicitante: string
          p_supervisao: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sincronizar_frotas_veiculos_patrimonios: { Args: never; Returns: Json }
      sincronizar_operacional_os_da_lista_grm: {
        Args: { p_data: string }
        Returns: Json
      }
      solicitar_aplicar_distribuicao_os: {
        Args: { p_motivo?: string }
        Returns: Json
      }
      solicitar_finalizacao_os_gestor: {
        Args: { p_motivo?: string }
        Returns: Json
      }
      substituir_producao_snapshot_periodo: {
        Args: { p_data_fim: string; p_data_ini: string; p_linhas: Json }
        Returns: number
      }
      uber_claim_removal_batch: {
        Args: { p_limit?: number }
        Returns: {
          arquivo_remoto: string | null
          cancelado_em: string | null
          colaborador_id: string
          created_at: string
          detectado_em: string
          email: string | null
          enviado_em: string | null
          fonte: string | null
          id: string
          nome: string
          status: string
          status_historico_id: string | null
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "uber_colaboradores_remocao_fila"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      uber_gorjeta_reenviar_caixa: { Args: { p_ids?: string[] }; Returns: Json }
      uber_gorjeta_solicitar_job: {
        Args: { p_origem: string; p_usuario?: string }
        Returns: string
      }
      uber_gorjeta_usuario_tem_acesso: { Args: never; Returns: boolean }
      uber_gps_solicitar: { Args: { p_ids?: string[] }; Returns: Json }
      uber_gps_solicitar_job: {
        Args: { p_origem: string; p_usuario?: string }
        Returns: string
      }
      uber_normaliza_nome: { Args: { p_nome: string }; Returns: string }
      uber_reconciliar_colaboradores_ativos: { Args: never; Returns: number }
      uber_reconciliar_colaboradores_inativos: { Args: never; Returns: number }
      uber_resolve_email_remocao: {
        Args: { p_colaborador_id: string; p_nome: string }
        Returns: string
      }
      uber_validar_por_os_laudo: { Args: { p_id: string }; Returns: Json }
      unaccent: { Args: { "": string }; Returns: string }
      update_grm_sync_agent_setting: {
        Args: {
          p_agent_id: string
          p_interval_minutes: number
          p_queue_lane: string
        }
        Returns: {
          agent_id: string
          depends_on: Json
          direction: string | null
          enabled: boolean
          interval_minutes: number
          legacy_lane_before_v2: string | null
          max_runtime_minutes: number
          mutex_group: string | null
          priority: number
          queue_lane: string
          resource_class: string | null
          target_lane: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "grm_sync_agent_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_programacao_despesas: {
        Args: {
          p_coordenacao: string
          p_data_referencia: string
          p_itens: Json
          p_queue_id: string
          p_solicitante: string
          p_supervisao: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
