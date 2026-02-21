; ZAX lowered .asm trace
; range: $0100..$0166 (end exclusive)

; func write_pair begin
write_pair:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
push HL                        ; 010B: E5
ld a, (IX+$04)                 ; 010C: DD 7E 04
ld (pair_buf), A               ; 010F: 32 00 00
ld a, (IX+$06)                 ; 0112: DD 7E 06
ld (pair_buf + 1), A           ; 0115: 32 00 00
__zax_epilogue_0:
pop HL                         ; 0118: E1
pop DE                         ; 0119: D1
pop BC                         ; 011A: C1
pop AF                         ; 011B: F1
ld SP, IX                      ; 011C: DD F9
pop IX                         ; 011E: DD E1
ret                            ; 0120: C9
; func read_pair_word begin
; func write_pair end
read_pair_word:
push IX                        ; 0121: DD E5
ld IX, $0000                   ; 0123: DD 21 00 00
add IX, SP                     ; 0127: DD 39
push AF                        ; 0129: F5
push BC                        ; 012A: C5
push DE                        ; 012B: D5
ld HL, pair_buf                ; 012C: 21 00 00
ld L, (hl)                     ; 012F: 6E
ld HL, pair_buf + 1            ; 0130: 21 00 00
ld H, (hl)                     ; 0133: 66
__zax_epilogue_1:
pop DE                         ; 0134: D1
pop BC                         ; 0135: C1
pop AF                         ; 0136: F1
ld SP, IX                      ; 0137: DD F9
pop IX                         ; 0139: DD E1
ret                            ; 013B: C9
; func main begin
; func read_pair_word end
main:
push IX                        ; 013C: DD E5
ld IX, $0000                   ; 013E: DD 21 00 00
add IX, SP                     ; 0142: DD 39
push AF                        ; 0144: F5
push BC                        ; 0145: C5
push DE                        ; 0146: D5
push HL                        ; 0147: E5
ld HL, $0002                   ; 0148: 21 02 00
push HL                        ; 014B: E5
ld HL, $0001                   ; 014C: 21 01 00
push HL                        ; 014F: E5
call write_pair                ; 0150: CD 00 00
inc SP                         ; 0153: 33
inc SP                         ; 0154: 33
inc SP                         ; 0155: 33
inc SP                         ; 0156: 33
ld A, (pair_buf)               ; 0157: 3A 00 00
call read_pair_word            ; 015A: CD 00 00
__zax_epilogue_2:
pop HL                         ; 015D: E1
pop DE                         ; 015E: D1
pop BC                         ; 015F: C1
pop AF                         ; 0160: F1
ld SP, IX                      ; 0161: DD F9
pop IX                         ; 0163: DD E1
ret                            ; 0165: C9
; func main end

; symbols:
; label write_pair = $0100
; label __zax_epilogue_0 = $0118
; label read_pair_word = $0121
; label __zax_epilogue_1 = $0134
; label main = $013C
; label __zax_epilogue_2 = $015D
; var pair_buf = $0166
