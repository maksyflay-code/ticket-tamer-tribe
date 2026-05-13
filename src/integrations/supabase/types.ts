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
      chamado_anexos: {
        Row: {
          chamado_id: string
          created_at: string
          id: string
          mime_type: string | null
          nome_arquivo: string
          storage_path: string
          tamanho: number | null
        }
        Insert: {
          chamado_id: string
          created_at?: string
          id?: string
          mime_type?: string | null
          nome_arquivo: string
          storage_path: string
          tamanho?: number | null
        }
        Update: {
          chamado_id?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          nome_arquivo?: string
          storage_path?: string
          tamanho?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chamado_anexos_chamado_id_fkey"
            columns: ["chamado_id"]
            isOneToOne: false
            referencedRelation: "chamados"
            referencedColumns: ["id"]
          },
        ]
      }
      chamado_historico: {
        Row: {
          autor: string | null
          chamado_id: string
          created_at: string
          descricao: string
          id: string
          status_anterior: string | null
          status_novo: string | null
          tipo: string
        }
        Insert: {
          autor?: string | null
          chamado_id: string
          created_at?: string
          descricao: string
          id?: string
          status_anterior?: string | null
          status_novo?: string | null
          tipo?: string
        }
        Update: {
          autor?: string | null
          chamado_id?: string
          created_at?: string
          descricao?: string
          id?: string
          status_anterior?: string | null
          status_novo?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "chamado_historico_chamado_id_fkey"
            columns: ["chamado_id"]
            isOneToOne: false
            referencedRelation: "chamados"
            referencedColumns: ["id"]
          },
        ]
      }
      chamados: {
        Row: {
          categoria: string | null
          cliente_id: string | null
          created_at: string
          descricao: string | null
          id: string
          numero: number
          prioridade: Database["public"]["Enums"]["chamado_prioridade"]
          resolvido_at: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["chamado_status"]
          tecnico_responsavel: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          cliente_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          numero?: number
          prioridade?: Database["public"]["Enums"]["chamado_prioridade"]
          resolvido_at?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["chamado_status"]
          tecnico_responsavel?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          cliente_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          numero?: number
          prioridade?: Database["public"]["Enums"]["chamado_prioridade"]
          resolvido_at?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["chamado_status"]
          tecnico_responsavel?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chamados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          cidade: string | null
          created_at: string
          data_contrato: string | null
          documento: string | null
          email: string | null
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          plano: string | null
          plano_id: string | null
          status: Database["public"]["Enums"]["cliente_status"]
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          data_contrato?: string | null
          documento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          plano?: string | null
          plano_id?: string | null
          status?: Database["public"]["Enums"]["cliente_status"]
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          created_at?: string
          data_contrato?: string | null
          documento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          plano?: string | null
          plano_id?: string | null
          status?: Database["public"]["Enums"]["cliente_status"]
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipamentos: {
        Row: {
          ativo: boolean
          created_at: string
          fabricante: string
          hostname: string
          id: string
          ipv4: string
          observacoes: string | null
          pop: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          fabricante?: string
          hostname: string
          id?: string
          ipv4: string
          observacoes?: string | null
          pop?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          fabricante?: string
          hostname?: string
          id?: string
          ipv4?: string
          observacoes?: string | null
          pop?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      planos: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          preco: number
          tipo: string
          updated_at: string
          velocidade_download: number | null
          velocidade_upload: number | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          preco?: number
          tipo?: string
          updated_at?: string
          velocidade_download?: number | null
          velocidade_upload?: number | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          preco?: number
          tipo?: string
          updated_at?: string
          velocidade_download?: number | null
          velocidade_upload?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read: { Args: { _user_id: string }; Returns: boolean }
      can_write: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "operador" | "visualizador"
      chamado_prioridade: "baixa" | "media" | "alta" | "urgente"
      chamado_status: "aberto" | "em_andamento" | "resolvido" | "fechado"
      cliente_status: "ativo" | "inativo" | "suspenso"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operador", "visualizador"],
      chamado_prioridade: ["baixa", "media", "alta", "urgente"],
      chamado_status: ["aberto", "em_andamento", "resolvido", "fechado"],
      cliente_status: ["ativo", "inativo", "suspenso"],
    },
  },
} as const
