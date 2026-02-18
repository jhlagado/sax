; ZAX lowered .asm trace
; range: $0100..$0145 (end exclusive)

; func read_counter begin
read_counter:
push AF                        ; 0100: F5
push BC                        ; 0101: C5
push DE                        ; 0102: D5
ld HL, (counter)               ; 0103: 2A 00 00
__zax_epilogue_0:
pop DE                         ; 0106: D1
pop BC                         ; 0107: C1
pop AF                         ; 0108: F1
ret                            ; 0109: C9
; func read_counter end
; func write_counter begin
write_counter:
push IX                        ; 010A: DD E5
ld IX, $0000                   ; 010C: DD 21 00 00
add IX, SP                     ; 0110: DD 39
push AF                        ; 0112: F5
push BC                        ; 0113: C5
push DE                        ; 0114: D5
push IX                        ; 0115: DD E5
pop HL                         ; 0117: E1
push DE                        ; 0118: D5
ld DE, $0004                   ; 0119: 11 04 00
add HL, DE                     ; 011C: 19
pop DE                         ; 011D: D1
ld a, (hl) ; inc hl ; ld h, (hl) ; ld l, a ; 011E: 7E 23 66 6F
push HL                        ; 0122: E5
ld HL, counter                 ; 0123: 21 00 00
pop DE                         ; 0126: D1
ld (hl), e ; inc hl ; ld (hl), d ; 0127: 73 23 72
__zax_epilogue_1:
pop DE                         ; 012A: D1
pop BC                         ; 012B: C1
pop AF                         ; 012C: F1
ld SP, IX                      ; 012D: DD F9
pop IX                         ; 012F: DD E1
ret                            ; 0131: C9
; func main begin
; func write_counter end
main:
push AF                        ; 0132: F5
push BC                        ; 0133: C5
push DE                        ; 0134: D5
ld HL, $007B                   ; 0135: 21 7B 00
push HL                        ; 0138: E5
call write_counter             ; 0139: CD 00 00
inc SP                         ; 013C: 33
inc SP                         ; 013D: 33
ld HL, (counter)               ; 013E: 2A 00 00
__zax_epilogue_2:
pop DE                         ; 0141: D1
pop BC                         ; 0142: C1
pop AF                         ; 0143: F1
ret                            ; 0144: C9
; func main end

; symbols:
; label read_counter = $0100
; label __zax_epilogue_0 = $0106
; label write_counter = $010A
; label __zax_epilogue_1 = $012A
; label main = $0132
; label __zax_epilogue_2 = $0141
; var counter = $0146
