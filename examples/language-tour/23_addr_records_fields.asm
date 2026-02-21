; ZAX lowered .asm trace
; range: $0100..$014B (end exclusive)

; func poke_record begin
poke_record:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld a, (IX+$04)                 ; 010B: DD 7E 04
ld (rec_a), A                  ; 010E: 32 00 00
ex de, hl                      ; 0111: EB
ld e, (IX+$06)                 ; 0112: DD 5E 06
ld d, (IX+$07)                 ; 0115: DD 56 07
ex de, hl                      ; 0118: EB
ld (rec_a + 1), HL             ; 0119: 22 00 00
ld HL, (rec_a + 1)             ; 011C: 2A 00 00
__zax_epilogue_0:
pop DE                         ; 011F: D1
pop BC                         ; 0120: C1
pop AF                         ; 0121: F1
ld SP, IX                      ; 0122: DD F9
pop IX                         ; 0124: DD E1
ret                            ; 0126: C9
; func main begin
; func poke_record end
main:
push IX                        ; 0127: DD E5
ld IX, $0000                   ; 0129: DD 21 00 00
add IX, SP                     ; 012D: DD 39
push AF                        ; 012F: F5
push BC                        ; 0130: C5
push DE                        ; 0131: D5
push HL                        ; 0132: E5
ld HL, $1234                   ; 0133: 21 34 12
push HL                        ; 0136: E5
ld HL, $0001                   ; 0137: 21 01 00
push HL                        ; 013A: E5
call poke_record               ; 013B: CD 00 00
inc SP                         ; 013E: 33
inc SP                         ; 013F: 33
inc SP                         ; 0140: 33
inc SP                         ; 0141: 33
__zax_epilogue_1:
pop HL                         ; 0142: E1
pop DE                         ; 0143: D1
pop BC                         ; 0144: C1
pop AF                         ; 0145: F1
ld SP, IX                      ; 0146: DD F9
pop IX                         ; 0148: DD E1
ret                            ; 014A: C9
; func main end

; symbols:
; label poke_record = $0100
; label __zax_epilogue_0 = $011F
; label main = $0127
; label __zax_epilogue_1 = $0142
; var rec_a = $014C
