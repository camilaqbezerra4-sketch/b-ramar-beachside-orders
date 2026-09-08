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
      barracas: {
        Row: {
          chave_pix: string
          criado_em: string
          id: string
          nome: string
          updated_at: string
          whatsapp_suporte: string
        }
        Insert: {
          chave_pix?: string
          criado_em?: string
          id?: string
          nome: string
          updated_at?: string
          whatsapp_suporte?: string
        }
        Update: {
          chave_pix?: string
          criado_em?: string
          id?: string
          nome?: string
          updated_at?: string
          whatsapp_suporte?: string
        }
        Relationships: []
      }
      garcons: {
        Row: {
          barraca_id: string
          chave_pix: string
          criado_em: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          barraca_id: string
          chave_pix?: string
          criado_em?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          barraca_id?: string
          chave_pix?: string
          criado_em?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "garcons_barraca_id_fkey"
            columns: ["barraca_id"]
            isOneToOne: false
            referencedRelation: "barracas"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_pedido: {
        Row: {
          criado_em: string
          id: string
          nome_produto: string
          pedido_id: string
          preco: number
          produto_id: string | null
          quantidade: number
          updated_at: string
        }
        Insert: {
          criado_em?: string
          id?: string
          nome_produto: string
          pedido_id: string
          preco?: number
          produto_id?: string | null
          quantidade?: number
          updated_at?: string
        }
        Update: {
          criado_em?: string
          id?: string
          nome_produto?: string
          pedido_id?: string
          preco?: number
          produto_id?: string | null
          quantidade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_pedido_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      mesas: {
        Row: {
          barraca_id: string
          criado_em: string
          id: string
          numero: number
          tem_qrcode: boolean
          updated_at: string
        }
        Insert: {
          barraca_id: string
          criado_em?: string
          id?: string
          numero: number
          tem_qrcode?: boolean
          updated_at?: string
        }
        Update: {
          barraca_id?: string
          criado_em?: string
          id?: string
          numero?: number
          tem_qrcode?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mesas_barraca_id_fkey"
            columns: ["barraca_id"]
            isOneToOne: false
            referencedRelation: "barracas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          barraca_id: string
          criado_em: string
          garcom_id: string | null
          gorjeta: number
          id: string
          mesa_id: string
          origem: string
          pago: boolean
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          barraca_id: string
          criado_em?: string
          garcom_id?: string | null
          gorjeta?: number
          id?: string
          mesa_id: string
          origem?: string
          pago?: boolean
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          barraca_id?: string
          criado_em?: string
          garcom_id?: string | null
          gorjeta?: number
          id?: string
          mesa_id?: string
          origem?: string
          pago?: boolean
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_barraca_id_fkey"
            columns: ["barraca_id"]
            isOneToOne: false
            referencedRelation: "barracas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_garcom_id_fkey"
            columns: ["garcom_id"]
            isOneToOne: false
            referencedRelation: "garcons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_mesa_id_fkey"
            columns: ["mesa_id"]
            isOneToOne: false
            referencedRelation: "mesas"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          barraca_id: string
          categoria: string
          criado_em: string
          disponivel: boolean
          id: string
          nome: string
          preco: number
          updated_at: string
        }
        Insert: {
          barraca_id: string
          categoria?: string
          criado_em?: string
          disponivel?: boolean
          id?: string
          nome: string
          preco?: number
          updated_at?: string
        }
        Update: {
          barraca_id?: string
          categoria?: string
          criado_em?: string
          disponivel?: boolean
          id?: string
          nome?: string
          preco?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_barraca_id_fkey"
            columns: ["barraca_id"]
            isOneToOne: false
            referencedRelation: "barracas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
