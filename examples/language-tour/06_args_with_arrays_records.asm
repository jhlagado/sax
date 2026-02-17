; ZAX lowered .asm trace
; range: $0100..$0178 (end exclusive)

; func read_byte_at begin
read_byte_at:
ld HL, $0002                   ; 0100: 21 02 00
add HL, SP                     ; 0103: 39
push HL                        ; 0104: E5
pop HL                         ; 0105: E1
ld a, (hl)                     ; 0106: 7E
inc HL                         ; 0107: 23
ld h, (hl) ; ld l, a           ; 0108: 66 6F
push HL                        ; 010A: E5
pop HL                         ; 010B: E1
push HL                        ; 010C: E5
ld HL, sample_bytes            ; 010D: 21 00 00
pop DE                         ; 0110: D1
add HL, DE                     ; 0111: 19
push HL                        ; 0112: E5
pop HL                         ; 0113: E1
ld A, (hl)                     ; 0114: 7E
ret                            ; 0115: C9
; func read_byte_at end
; func read_word_at begin
read_word_at:
ld HL, $0002                   ; 0116: 21 02 00
add HL, SP                     ; 0119: 39
push HL                        ; 011A: E5
pop HL                         ; 011B: E1
ld a, (hl)                     ; 011C: 7E
inc HL                         ; 011D: 23
ld h, (hl) ; ld l, a           ; 011E: 66 6F
push HL                        ; 0120: E5
pop HL                         ; 0121: E1
add HL, HL                     ; 0122: 29
push HL                        ; 0123: E5
ld HL, sample_words            ; 0124: 21 00 00
pop DE                         ; 0127: D1
add HL, DE                     ; 0128: 19
push HL                        ; 0129: E5
pop HL                         ; 012A: E1
push AF                        ; 012B: F5
ld A, (HL)                     ; 012C: 7E
inc HL                         ; 012D: 23
ld H, (HL)                     ; 012E: 66
ld L, A                        ; 012F: 6F
pop AF                         ; 0130: F1
ret                            ; 0131: C9
; func main begin
; func read_word_at end
main:
push AF                        ; 0132: F5
push BC                        ; 0133: C5
push DE                        ; 0134: D5
push IX                        ; 0135: DD E5
push IY                        ; 0137: FD E5
ld HL, $0003                   ; 0139: 21 03 00
push HL                        ; 013C: E5
call read_byte_at              ; 013D: CD 00 00
pop BC                         ; 0140: C1
pop IY                         ; 0141: FD E1
pop IX                         ; 0143: DD E1
pop DE                         ; 0145: D1
pop BC                         ; 0146: C1
pop AF                         ; 0147: F1
push AF                        ; 0148: F5
push BC                        ; 0149: C5
push DE                        ; 014A: D5
push IX                        ; 014B: DD E5
push IY                        ; 014D: FD E5
ld HL, $0001                   ; 014F: 21 01 00
push HL                        ; 0152: E5
call read_word_at              ; 0153: CD 00 00
pop BC                         ; 0156: C1
pop IY                         ; 0157: FD E1
pop IX                         ; 0159: DD E1
pop DE                         ; 015B: D1
pop BC                         ; 015C: C1
pop AF                         ; 015D: F1
ret                            ; 015E: C9
; func main end

; symbols:
; label read_byte_at = $0100
; label read_word_at = $0116
; label main = $0132
; data sample_bytes = $0160
; data sample_words = $0170
