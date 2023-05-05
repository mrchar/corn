package net.mrchar.corn.model;

import jakarta.persistence.*;
import lombok.Getter;
import net.mrchar.corn.model.base.AuditableEntity;

@Getter
@Entity
@Table(name = "quota")
public class Quota extends AuditableEntity {
    @ManyToOne
    @JoinColumn(name = "budge_id")
    private Budget budget;

    @ManyToOne
    @JoinColumn(name = "action_id")
    private Action action;

    @Column(name = "amount")
    private Double amount;
}
